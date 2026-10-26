import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { z } from "zod";

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");

const app = new URL(process.env.SMOKE_APP_URL ?? "http://localhost:3100");
const database = new URL(process.env.DATABASE_URL);
for (const target of [app, database]) {
  assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Smoke checks require localhost services.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const checks = [];
const disposableBoards = new Set();
const fixtures = { run: suffix, app: app.origin, users: {}, boards: [] };
let owner;
let actionIds = new Map();
const actionResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: z.string(), code: z.string().optional() }),
]);
const userSchema = z.object({ id: z.string(), email: z.string(), name: z.string(), emailVerified: z.boolean() });
const snapshotSchema = z.object({
  board: z.object({ id: z.uuid(), title: z.string(), role: z.enum(["owner", "editor", "viewer"]), completedCount: z.number() }),
  columns: z.array(z.object({ id: z.uuid(), title: z.string(), isDone: z.boolean() })),
  tasks: z.array(z.object({ id: z.uuid(), columnId: z.uuid(), title: z.string(), description: z.string(), color: z.string(), dueDate: z.string().nullable(), assigneeId: z.string().nullable(), version: z.number() })),
  members: z.array(z.object({ id: z.string(), role: z.string() })), revision: z.number(),
});

function record(label) {
  checks.push({ label, passed: true });
  console.log(`PASS ${label}`);
}

async function authRequest(path, input, cookies = "") {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(new URL(`/api/auth/${path}`, app), {
      method: "POST", redirect: "manual",
      headers: { Origin: app.origin, "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify(input),
    });
    if (response.status !== 429 || attempt === 9) return response;
    const waitSeconds = Number(response.headers.get("Retry-After")) || 15;
    await response.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, Math.min(waitSeconds, 60) * 1000));
  }
}

function responseCookies(response) {
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}

async function signIn(email, password) {
  const response = await authRequest("sign-in/email", { email, password });
  assert.equal(response.status, 200, "Verified account signs in.");
  const value = z.object({ user: userSchema }).parse(await response.json());
  const cookies = responseCookies(response);
  assert(cookies.includes("session_token="), "Sign-in sets a session cookie.");
  return { ...value.user, cookies };
}

async function createUser(label) {
  const email = `smoke-${label}-${suffix}@twello.test`;
  const password = randomBytes(24).toString("base64url");
  const response = await authRequest("sign-up/email", { name: `Smoke ${label}`, email, password, callbackURL: "/" });
  assert.equal(response.status, 200, "Account signs up through Better Auth.");
  assert(responseCookies(response).includes("session_token="), "Signup signs in immediately without email verification.");
  const account = await signIn(email, password);
  assert.equal(account.emailVerified, false);
  fixtures.users[label] = { id: account.id, email: account.email };
  record(`${label} signs up and signs in without email verification`);
  return account;
}

async function compile(path, cookies) {
  const response = await fetch(new URL(path, app), { headers: { Cookie: cookies } });
  assert.equal(response.status, 200, `Compile ${path} page.`);
  await response.arrayBuffer();
  const manifest = JSON.parse(await readFile(".next/dev/server/server-reference-manifest.json", "utf8"));
  actionIds = new Map(Object.entries(manifest.node).map(([id, entry]) => [entry.exportedName, id]));
}

async function action(name, input, account = owner) {
  const id = actionIds.get(name);
  assert(id, `Compiled action ${name} is in Next's manifest.`);
  const response = await fetch(app, {
    method: "POST", headers: {
      "Next-Action": id, Origin: app.origin, "Content-Type": "application/json",
      Accept: "text/x-component", Cookie: account?.cookies ?? "",
    },
    body: JSON.stringify([input]),
  });
  assert.equal(response.status, 200, `${name} HTTP response.`);
  const body = await response.text();
  const resultLine = body.split("\n").find(line => /^[0-9a-f]+:\{"ok":/.test(line));
  assert(resultLine, `${name} returns a structured action result.`);
  return actionResult.parse(JSON.parse(resultLine.slice(resultLine.indexOf(":") + 1)));
}

async function success(name, input, account = owner) {
  const result = await action(name, input, account);
  assert.equal(result.ok, true, `${name} succeeds${result.ok ? "" : ` (${result.code ?? "no code"})`}.`);
  return result.data;
}

async function denied(name, input, code, account) {
  const result = await action(name, input, account);
  assert.equal(result.ok, false, `${name} is rejected.`);
  assert.equal(result.code, code, `${name} rejection code.`);
}

async function snapshot(boardId, account = owner, expectedStatus = 200) {
  const response = await fetch(new URL(`/api/boards/${boardId}`, app), { headers: { Cookie: account?.cookies ?? "" } });
  assert.equal(response.status, expectedStatus, "Board snapshot HTTP status.");
  if (expectedStatus !== 200) return;
  const payload = await response.json();
  assert(payload.members.every(member => !("email" in member)), "Board responses do not expose member email addresses.");
  return snapshotSchema.parse(payload);
}

async function createBoard(title) {
  const value = z.object({ id: z.uuid() }).parse(await success("createBoard", { title, description: "Disposable HTTP smoke fixture", color: "blue" }));
  disposableBoards.add(value.id);
  fixtures.boards.push(value.id);
  return value.id;
}

function inviteToken(value) {
  return z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(new URL(value.url).pathname.split("/").at(-1));
}

function taskValues(task) {
  return { title: task.title, description: task.description, color: task.color, dueDate: task.dueDate, assigneeId: task.assigneeId };
}

try {
  owner = await createUser("owner");
  await compile("/", owner.cookies);
  const boardId = await createBoard(`Smoke collaboration ${suffix}`);
  const secondBoardId = await createBoard(`Smoke second board ${suffix}`);
  await compile(`/boards/${boardId}`, owner.cookies);
  await compile("/profile", owner.cookies);
  await compile(`/invite/${"a".repeat(43)}`, owner.cookies);
  let board = await snapshot(boardId);
  const otherBoard = await snapshot(secondBoardId);
  assert.equal(board.board.title, `Smoke collaboration ${suffix}`);
  assert.equal(otherBoard.board.title, `Smoke second board ${suffix}`);
  assert.deepEqual(board.columns.map(column => column.title), ["To do", "In progress", "Done"]);
  record("owner creates multiple independent boards with default kanban columns");
  const viewer = await createUser("viewer");
  const editor = await createUser("editor");
  const outsider = await createUser("outsider");
  await snapshot(boardId, outsider, 403);
  await denied("createColumn", { boardId, title: "Unauthorized" }, "FORBIDDEN", outsider);
  await snapshot(boardId, null, 401);
  await denied("createBoard", { title: "Anonymous board" }, "UNAUTHORIZED", null);
  record("outsiders cannot read or write boards and anonymous requests require sign-in");

  const viewerInvite = z.object({ url: z.url(), emailed: z.boolean() }).parse(await success("createInvite", { boardId, role: "viewer" }));
  assert.equal(viewerInvite.emailed, false);
  const viewerToken = inviteToken(viewerInvite);
  await success("acceptInvite", { token: viewerToken }, viewer);
  await success("acceptInvite", { token: viewerToken }, viewer);
  const viewerBoard = await snapshot(boardId, viewer);
  assert.equal(viewerBoard.board.role, "viewer");
  assert.equal(viewerBoard.members.filter(member => member.id === viewer.id).length, 1);
  await denied("createColumn", { boardId, title: "Viewer edit" }, "FORBIDDEN", viewer);
  await denied("createInvite", { boardId, role: "editor" }, "FORBIDDEN", viewer);
  await denied("listInvites", { boardId }, "FORBIDDEN", viewer);
  record("shared viewer link accepts idempotently and viewers cannot edit or manage invitations");

  const editorInvite = z.object({ url: z.url(), emailed: z.boolean() }).parse(await success("createInvite", { boardId, role: "editor" }));
  assert.equal(editorInvite.emailed, false);
  const token = inviteToken(editorInvite);
  await success("acceptInvite", { token }, editor);
  assert.equal((await snapshot(boardId, editor)).board.role, "editor");
  await denied("createInvite", { boardId, role: "editor", email: outsider.email }, "VALIDATION");
  record("editor share links work and email invitations are disabled");

  const taskInput = { boardId, columnId: board.columns[0].id, title: "Ship the collaboration flow", description: "Verify assignments, completion and conflict protection", color: "yellow", dueDate: "2026-10-30", assigneeId: editor.id };
  await success("createTask", taskInput, editor);
  board = await snapshot(boardId, viewer);
  let task = board.tasks.find(value => value.title === taskInput.title);
  assert(task);
  assert.equal(task.assigneeId, editor.id);
  assert.equal(task.description, taskInput.description);
  assert.equal(task.dueDate, "2026-10-30");
  const done = board.columns.find(column => column.isDone);
  assert(done);
  await success("moveTask", { boardId, taskId: task.id, expectedVersion: task.version, columnId: done.id, beforeTaskId: null }, editor);
  board = await snapshot(boardId, viewer);
  task = board.tasks.find(value => value.id === task.id);
  assert.equal(task.columnId, done.id);
  assert.equal(board.board.completedCount, 1);
  record("editor creates, assigns and completes a task visible to another collaborator");

  const edit = { ...taskValues(task), boardId, taskId: task.id, expectedVersion: task.version };
  await success("updateTask", { ...edit, description: "First saved edit" }, editor);
  await denied("updateTask", { ...edit, description: "Stale overwrite" }, "CONFLICT", owner);
  assert.equal((await snapshot(boardId)).tasks.find(value => value.id === task.id).description, "First saved edit");
  task = (await snapshot(boardId)).tasks.find(value => value.id === task.id);
  const concurrent = await Promise.all(["Concurrent A", "Concurrent B"].map(description => action("updateTask", { ...taskValues(task), boardId, taskId: task.id, expectedVersion: task.version, description }, editor)));
  assert.equal(concurrent.filter(result => result.ok).length, 1);
  assert.deepEqual(concurrent.filter(result => !result.ok).map(result => result.code), ["CONFLICT"]);
  const persisted = (await snapshot(boardId)).tasks.find(value => value.id === task.id);
  assert.equal(persisted.version, task.version + 1);
  assert(["Concurrent A", "Concurrent B"].includes(persisted.description));
  record("stale and concurrent task edits preserve one winner and reject lost updates");

  await denied("createTask", { ...taskInput, columnId: otherBoard.columns[0].id }, "NOT_FOUND", editor);
  await denied("createTask", { ...taskInput, assigneeId: outsider.id }, "INVALID_REQUEST", editor);
  await denied("moveTask", { boardId, taskId: persisted.id, expectedVersion: persisted.version, columnId: otherBoard.columns[0].id, beforeTaskId: null }, "NOT_FOUND", editor);
  record("task columns and assignees must belong to the same board");

  await success("updateMember", { boardId, userId: editor.id, role: "viewer" });
  await success("acceptInvite", { token }, editor);
  assert.equal((await snapshot(boardId, editor)).board.role, "viewer");
  await denied("createColumn", { boardId, title: "Regained edit" }, "FORBIDDEN", editor);
  record("reaccepting an old editor invitation does not undo an owner demotion");
  const invites = z.array(z.object({ id: z.uuid(), role: z.string() })).parse(await success("listInvites", { boardId }));
  const editorInviteRow = invites.find(invite => invite.role === "editor");
  assert(editorInviteRow);
  await success("revokeInvite", { boardId, inviteId: editorInviteRow.id });
  await denied("acceptInvite", { token }, "INVITE_INVALID", editor);
  record("revoked invitation links cannot be accepted");

  await success("removeMember", { boardId, userId: editor.id });
  await snapshot(boardId, editor, 403);
  await denied("createColumn", { boardId, title: "Removed edit" }, "FORBIDDEN", editor);
  const removedBoard = await snapshot(boardId);
  assert.equal(removedBoard.tasks.find(value => value.id === persisted.id).assigneeId, null);
  assert.equal(removedBoard.members.some(member => member.id === editor.id), false);
  record("removing a member immediately denies reads and writes and clears task assignments");

  await success("saveProfile", { name: "Smoke viewer updated", image: null, bio: "A persisted profile from the HTTP smoke check.", avatarColor: "violet" }, viewer);
  const profile = await pool.query('SELECT u.name, u.image, p.bio, p.avatar_color FROM "user" u JOIN profile p ON p.user_id = u.id WHERE u.id = $1', [viewer.id]);
  assert.deepEqual(profile.rows, [{ name: "Smoke viewer updated", image: null, bio: "A persisted profile from the HTTP smoke check.", avatar_color: "violet" }]);
  record("profile name, bio and avatar preference persist in PostgreSQL after an HTTP action");
  const signOut = await authRequest("sign-out", {}, viewer.cookies);
  assert.equal(signOut.status, 200);
  await snapshot(boardId, viewer, 401);
  await denied("createBoard", { title: "Expired session" }, "UNAUTHORIZED", viewer);
  record("sign-out invalidates the existing session for reads and writes");
} catch (error) {
  checks.push({ label: error instanceof Error ? error.message : "Unknown smoke failure", passed: false });
  console.error(`FAIL ${checks.at(-1).label}`);
  process.exitCode = 1;
} finally {
  if (owner) {
    for (const boardId of disposableBoards) {
      try {
        await success("deleteBoard", { boardId });
        const rows = await pool.query("SELECT id FROM board WHERE id = $1", [boardId]);
        assert.equal(rows.rowCount, 0);
      } catch (error) {
        checks.push({ label: `Disposable board cleanup failed (${error instanceof Error ? error.message : "unknown"})`, passed: false });
        process.exitCode = 1;
      }
    }
    fixtures.remainingOwnerBoards = (await pool.query("SELECT id, title FROM board WHERE owner_id = $1 ORDER BY title", [owner.id])).rows;
  }
  await pool.end();
  await mkdir(".audit", { recursive: true });
  const passed = checks.filter(check => check.passed).length;
  const failed = checks.length - passed;
  const report = [
    `Twello HTTP + PostgreSQL + Mailpit smoke run ${suffix}`,
    `App ${app.origin}`,
    ...checks.map(check => `${check.passed ? "PASS" : "FAIL"} ${check.label}`),
    `${passed} passed, ${failed} failed. Disposable boards were deleted through the owner action. Test users remain in the local database.`,
  ].join("\n") + "\n";
  await writeFile(".audit/smoke-report.txt", report);
  await writeFile(".audit/smoke-data.json", JSON.stringify(fixtures, null, 2) + "\n");
  console.log(`${passed} passed, ${failed} failed. Report .audit/smoke-report.txt`);
}
