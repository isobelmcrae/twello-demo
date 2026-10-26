"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { pool, transaction } from "@/lib/db";
import type { ActionResult, Invite } from "@/lib/types";

const id = z.uuid();
const userId = z.string().min(1).max(512);
const color = z.enum(["yellow", "pink", "blue", "green", "violet"]);
const role = z.enum(["viewer", "editor"]);
const boardInput = z.object({ boardId: id });
const boardDetails = z.object({
  title: z.string().trim().min(1, "Give your board a name.").max(120),
  description: z.string().trim().max(2000).default(""), color: color.default("yellow"),
});
const taskInput = z.object({
  title: z.string().trim().min(1, "Give your task a title.").max(200),
  description: z.string().max(10000), color,
  dueDate: z.iso.date().nullable(), assigneeId: userId.nullable(),
});
const taskRef = boardInput.extend({ taskId: id, expectedVersion: z.number().int().positive() });
const tokenInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This invitation is invalid.") });
const accessSchema = z.object({ ownerId: z.string(), role: z.enum(["owner", "editor", "viewer"]), title: z.string() });
type Access = z.infer<typeof accessSchema>;
type SignedInUser = Awaited<ReturnType<typeof requireUser>>;
type Permission = "read" | "edit" | "owner";

class ActionError extends Error {
  constructor(message: string, readonly code = "INVALID_REQUEST") { super(message); }
}

async function result<T>(run: (user: SignedInUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser().catch(() => {
      throw new ActionError("Sign in to continue.", "UNAUTHORIZED");
    });
    return { ok: true, data: await run(user) };
  } catch (error) {
    if (error instanceof ActionError) return { ok: false, error: error.message, code: error.code };
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Check the details and try again.", code: "VALIDATION" };
    return { ok: false, error: "Something went wrong. Refresh and try again.", code: "SERVER_ERROR" };
  }
}

async function lockBoard(client: PoolClient, boardId: string, actorId: string, permission: Permission): Promise<Access> {
  const locked = await client.query(`SELECT id FROM board WHERE id = $1 FOR UPDATE`, [boardId]);
  if (!locked.rows[0]) throw new ActionError("This board is unavailable.", "FORBIDDEN");
  const found = await client.query(
    `SELECT b.owner_id AS "ownerId", b.title,
       CASE WHEN b.owner_id = $2 THEN 'owner' ELSE m.role END AS role
     FROM board b LEFT JOIN board_member m ON m.board_id = b.id AND m.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR m.user_id IS NOT NULL)`,
    [boardId, actorId],
  );
  if (!found.rows[0]) throw new ActionError("You no longer have access to this board.", "FORBIDDEN");
  const access = accessSchema.parse(found.rows[0]);
  if ((permission === "owner" && access.role !== "owner") || (permission === "edit" && access.role === "viewer")) {
    throw new ActionError("You do not have permission to make this change.", "FORBIDDEN");
  }
  return access;
}

async function touch(client: PoolClient, boardId: string): Promise<void> {
  await client.query(`UPDATE board SET revision = revision + 1, updated_at = now() WHERE id = $1`, [boardId]);
}

async function checkColumn(client: PoolClient, boardId: string, columnId: string): Promise<void> {
  const column = await client.query(`SELECT id FROM board_column WHERE id = $1 AND board_id = $2`, [columnId, boardId]);
  if (!column.rows[0]) throw new ActionError("That list no longer exists.", "NOT_FOUND");
}

async function checkAssignee(client: PoolClient, boardId: string, assigneeId: string | null): Promise<void> {
  if (!assigneeId) return;
  const found = await client.query(
    `SELECT 1 FROM board WHERE id = $1 AND owner_id = $2
     UNION ALL SELECT 1 FROM board_member WHERE board_id = $1 AND user_id = $2`,
    [boardId, assigneeId],
  );
  if (!found.rows[0]) throw new ActionError("Assign tasks to someone on this board.");
}

function checkVersion(rowCount: number | null): void {
  if (!rowCount) throw new ActionError("This task changed while you were editing. Refresh and try again.", "CONFLICT");
}

export async function createBoard(input: unknown): Promise<ActionResult<{ id: string }>> {
  return result(async (user) => {
    const values = boardDetails.parse(input);
    const boardId = randomUUID();
    await transaction(async (client) => {
      await client.query(`INSERT INTO board (id, owner_id, title, description, color) VALUES ($1,$2,$3,$4,$5)`,
        [boardId, user.id, values.title, values.description, values.color]);
      for (const [position, title] of ["To do", "In progress", "Done"].entries()) {
        await client.query(`INSERT INTO board_column (id, board_id, title, position, is_done) VALUES ($1,$2,$3,$4,$5)`,
          [randomUUID(), boardId, title, position, position === 2]);
      }
    });
    return { id: boardId };
  });
}

export async function updateBoard(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = boardDetails.extend({ boardId: id }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "edit");
      await client.query(`UPDATE board SET title = $2, description = $3, color = $4 WHERE id = $1`,
        [values.boardId, values.title, values.description, values.color]);
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function deleteBoard(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const { boardId } = boardInput.parse(input);
    await transaction(async (client) => {
      await lockBoard(client, boardId, user.id, "owner");
      await client.query(`DELETE FROM board WHERE id = $1`, [boardId]);
    });
    return undefined;
  });
}

export async function createColumn(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const { boardId, title } = boardInput.extend({ title: z.string().trim().min(1).max(80) }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, boardId, user.id, "edit");
      await client.query(
        `INSERT INTO board_column (id, board_id, title, position)
         SELECT $1, $2, $3, coalesce(max(position), -1) + 1 FROM board_column WHERE board_id = $2`,
        [randomUUID(), boardId, title],
      );
      await touch(client, boardId);
    });
    return undefined;
  });
}

export async function updateColumn(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = boardInput.extend({ columnId: id, title: z.string().trim().min(1).max(80), isDone: z.boolean() }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "edit");
      await checkColumn(client, values.boardId, values.columnId);
      await client.query(`UPDATE board_column SET title = $3, is_done = $4 WHERE id = $1 AND board_id = $2`,
        [values.columnId, values.boardId, values.title, values.isDone]);
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function deleteColumn(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const { boardId, columnId } = boardInput.extend({ columnId: id }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, boardId, user.id, "edit");
      await checkColumn(client, boardId, columnId);
      const tasks = await client.query(`SELECT 1 FROM task WHERE board_id = $1 AND column_id = $2 LIMIT 1`, [boardId, columnId]);
      if (tasks.rows[0]) throw new ActionError("Move or delete the tasks in this list first.");
      await client.query(`DELETE FROM board_column WHERE id = $1 AND board_id = $2`, [columnId, boardId]);
      await touch(client, boardId);
    });
    return undefined;
  });
}

export async function createTask(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = taskInput.extend({ boardId: id, columnId: id }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "edit");
      await checkColumn(client, values.boardId, values.columnId);
      await checkAssignee(client, values.boardId, values.assigneeId);
      await client.query(
        `INSERT INTO task (id, board_id, column_id, title, description, color, due_date, assignee_id, position)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,coalesce(max(position), -1) + 1 FROM task WHERE board_id = $2 AND column_id = $3`,
        [randomUUID(), values.boardId, values.columnId, values.title, values.description, values.color, values.dueDate, values.assigneeId],
      );
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function updateTask(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = taskInput.extend(taskRef.shape).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "edit");
      await checkAssignee(client, values.boardId, values.assigneeId);
      const updated = await client.query(
        `UPDATE task SET title = $4, description = $5, color = $6, due_date = $7, assignee_id = $8, version = version + 1
         WHERE id = $1 AND board_id = $2 AND version = $3`,
        [values.taskId, values.boardId, values.expectedVersion, values.title, values.description, values.color, values.dueDate, values.assigneeId],
      );
      checkVersion(updated.rowCount);
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function moveTask(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = taskRef.extend({ columnId: id, beforeTaskId: id.nullable() }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "edit");
      await checkColumn(client, values.boardId, values.columnId);
      const task = await client.query(`SELECT column_id AS "columnId", version FROM task WHERE id = $1 AND board_id = $2`, [values.taskId, values.boardId]);
      if (!task.rows[0]) throw new ActionError("This task no longer exists.", "CONFLICT");
      const current = z.object({ columnId: z.string(), version: z.number() }).parse(task.rows[0]);
      if (current.version !== values.expectedVersion) checkVersion(0);
      if (values.beforeTaskId === values.taskId) return;
      const destination = await client.query(`SELECT id FROM task WHERE board_id = $1 AND column_id = $2 AND id <> $3 ORDER BY position, id`,
        [values.boardId, values.columnId, values.taskId]);
      const ordered = z.object({ id: z.string() }).array().parse(destination.rows).map((row) => row.id);
      const index = values.beforeTaskId === null ? ordered.length : ordered.indexOf(values.beforeTaskId);
      if (index < 0) throw new ActionError("The list changed. Refresh and try again.", "CONFLICT");
      ordered.splice(index, 0, values.taskId);
      await client.query(`UPDATE task SET column_id = $3, version = version + 1 WHERE id = $1 AND board_id = $2`,
        [values.taskId, values.boardId, values.columnId]);
      await client.query(
        `UPDATE task t SET position = ordered.position - 1
         FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, position)
         WHERE t.board_id = $1 AND t.id = ordered.id`, [values.boardId, ordered],
      );
      if (current.columnId !== values.columnId) {
        await client.query(
          `WITH ordered AS (SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS position
            FROM task WHERE board_id = $1 AND column_id = $2)
           UPDATE task t SET position = ordered.position FROM ordered WHERE t.id = ordered.id`,
          [values.boardId, current.columnId],
        );
      }
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function deleteTask(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = taskRef.parse(input);
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "edit");
      const deleted = await client.query(`DELETE FROM task WHERE id = $1 AND board_id = $2 AND version = $3`,
        [values.taskId, values.boardId, values.expectedVersion]);
      checkVersion(deleted.rowCount);
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function createInvite(input: unknown): Promise<ActionResult<{ url: string; emailed: boolean }>> {
  return result(async (user) => {
    const values = boardInput.extend({ role, email: z.never().optional() }).parse(input);
    const token = randomBytes(32).toString("base64url");
    const inviteId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const appUrl = await getAppUrl();
    const url = new URL(`/invite/${token}`, appUrl).toString();
    await transaction(async (client) => {
      await lockBoard(client, values.boardId, user.id, "owner");
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`invite-owner:${user.id}`]);
      const limits = await client.query(
        `SELECT count(*)::int AS count FROM board_invite WHERE created_at > now() - interval '1 hour' AND created_by = $1`,
        [user.id],
      );
      const { count } = z.object({ count: z.number() }).parse(limits.rows[0]);
      if (count >= 20) throw new ActionError("Too many invitations. Try again in an hour.", "RATE_LIMITED");
      await client.query(`INSERT INTO board_invite (id, board_id, created_by, token_hash, role, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [inviteId, values.boardId, user.id, createHash("sha256").update(token).digest("hex"), values.role, expiresAt]);
    });

    return { url, emailed: false };
  });
}

export async function listInvites(input: unknown): Promise<ActionResult<Invite[]>> {
  return result(async (user) => {
    const { boardId } = boardInput.parse(input);
    return transaction(async (client) => {
      await lockBoard(client, boardId, user.id, "owner");
      const invites = await client.query(`SELECT id, role, expires_at AS "expiresAt", created_at AS "createdAt"
        FROM board_invite WHERE board_id = $1 AND email IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`, [boardId]);
      return z.object({ id: z.string(), role,
        expiresAt: z.date().transform((date) => date.toISOString()), createdAt: z.date().transform((date) => date.toISOString()),
      }).array().parse(invites.rows);
    });
  });
}

export async function revokeInvite(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const { boardId, inviteId } = boardInput.extend({ inviteId: id }).parse(input);
    await transaction(async (client) => {
      await lockBoard(client, boardId, user.id, "owner");
      await client.query(`UPDATE board_invite SET revoked_at = now() WHERE id = $1 AND board_id = $2`, [inviteId, boardId]);
    });
    return undefined;
  });
}

export async function acceptInvite(input: unknown): Promise<ActionResult<{ boardId: string }>> {
  return result(async (user) => {
    const { token } = tokenInput.parse(input);
    const hash = createHash("sha256").update(token).digest("hex");
    return transaction(async (client) => {
      const lookup = await client.query(`SELECT board_id AS "boardId" FROM board_invite WHERE token_hash = $1`, [hash]);
      if (!lookup.rows[0]) throw new ActionError("This invitation has expired or been revoked.", "INVITE_INVALID");
      const { boardId } = z.object({ boardId: z.string() }).parse(lookup.rows[0]);
      const boardResult = await client.query(`SELECT owner_id AS "ownerId" FROM board WHERE id = $1 FOR UPDATE`, [boardId]);
      if (!boardResult.rows[0]) throw new ActionError("This board is unavailable.", "INVITE_INVALID");
      const { ownerId } = z.object({ ownerId: z.string() }).parse(boardResult.rows[0]);
      const inviteResult = await client.query(`SELECT role, email FROM board_invite
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`, [hash]);
      if (!inviteResult.rows[0]) throw new ActionError("This invitation has expired or been revoked.", "INVITE_INVALID");
      const invite = z.object({ role, email: z.string().nullable() }).parse(inviteResult.rows[0]);
      if (invite.email) {
        throw new ActionError("Email invitations are paused. Ask the owner for a share link.", "EMAIL_DISABLED");
      }
      if (ownerId !== user.id) {
        await client.query(
          `INSERT INTO board_member (board_id, user_id, role) VALUES ($1,$2,$3)
           ON CONFLICT (board_id, user_id) DO NOTHING`,
          [boardId, user.id, invite.role],
        );
        await touch(client, boardId);
      }
      return { boardId };
    });
  });
}

export async function updateMember(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = boardInput.extend({ userId, role }).parse(input);
    await transaction(async (client) => {
      const access = await lockBoard(client, values.boardId, user.id, "owner");
      if (values.userId === access.ownerId) throw new ActionError("The board owner keeps ownership.");
      const updated = await client.query(`UPDATE board_member SET role = $3 WHERE board_id = $1 AND user_id = $2`,
        [values.boardId, values.userId, values.role]);
      if (!updated.rowCount) throw new ActionError("This person is no longer on the board.", "NOT_FOUND");
      await touch(client, values.boardId);
    });
    return undefined;
  });
}

export async function removeMember(input: unknown): Promise<ActionResult> {
  return result(async (user) => {
    const values = boardInput.extend({ userId }).parse(input);
    await transaction(async (client) => {
      const access = await lockBoard(client, values.boardId, user.id, "owner");
      if (values.userId === access.ownerId) throw new ActionError("The board owner cannot be removed.");
      await client.query(`UPDATE task SET assignee_id = NULL, version = version + 1 WHERE board_id = $1 AND assignee_id = $2`,
        [values.boardId, values.userId]);
      await client.query(`DELETE FROM board_member WHERE board_id = $1 AND user_id = $2`, [values.boardId, values.userId]);
      await touch(client, values.boardId);
    });
    return undefined;
  });
}
