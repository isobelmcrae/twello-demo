import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "@/lib/db";
import type { BoardSnapshot, BoardSummary, InvitePreview, Profile } from "@/lib/types";

const color = z.enum(["yellow", "pink", "blue", "green", "violet"]);
const timestamp = z.date().transform((value) => value.toISOString());
const summarySchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), color,
  role: z.enum(["owner", "editor", "viewer"]), updatedAt: timestamp,
  taskCount: z.number(), completedCount: z.number(), memberCount: z.number(),
});
const columnSchema = z.object({ id: z.string(), title: z.string(), position: z.number(), isDone: z.boolean() });
const taskSchema = z.object({
  id: z.string(), boardId: z.string(), columnId: z.string(), title: z.string(),
  description: z.string(), color, position: z.number(), dueDate: z.string().nullable(),
  assigneeId: z.string().nullable(), version: z.number(), createdAt: timestamp,
});
const memberSchema = z.object({
  id: z.string(), name: z.string(), image: z.string().nullable(),
  role: z.enum(["owner", "editor", "viewer"]),
});

const summarySelect = `
  SELECT b.id, b.title, b.description, b.color,
    CASE WHEN b.owner_id = $1 THEN 'owner' ELSE m.role END AS role,
    b.updated_at AS "updatedAt",
    (SELECT count(*)::int FROM task t WHERE t.board_id = b.id) AS "taskCount",
    (SELECT count(*)::int FROM task t JOIN board_column c ON c.id = t.column_id
      WHERE t.board_id = b.id AND c.is_done) AS "completedCount",
    (1 + (SELECT count(*)::int FROM board_member bm WHERE bm.board_id = b.id))::int AS "memberCount"
  FROM board b LEFT JOIN board_member m ON m.board_id = b.id AND m.user_id = $1
  WHERE (b.owner_id = $1 OR m.user_id IS NOT NULL)`;

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const result = await pool.query(`${summarySelect} ORDER BY b.updated_at DESC, b.id`, [userId]);
  return summarySchema.array().parse(result.rows);
}

export async function getBoard(boardId: string, userId: string): Promise<BoardSnapshot | null> {
  if (!z.uuid().safeParse(boardId).success) return null;
  return transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const boardResult = await client.query(`${summarySelect} AND b.id = $2`, [userId, boardId]);
    const row = boardResult.rows[0];
    if (!row) return null;
    const board = summarySchema.parse(row);
    const columns = await client.query(
      `SELECT id, title, position, is_done AS "isDone" FROM board_column WHERE board_id = $1 ORDER BY position, id`,
      [boardId],
    );
    const tasks = await client.query(
      `SELECT id, board_id AS "boardId", column_id AS "columnId", title, description, color,
        position, due_date::text AS "dueDate", assignee_id AS "assigneeId", version, created_at AS "createdAt"
       FROM task WHERE board_id = $1 ORDER BY position, id`,
      [boardId],
    );
    const members = await client.query(
      `SELECT u.id, u.name, u.image, 'owner' AS role FROM "user" u
         JOIN board b ON b.owner_id = u.id WHERE b.id = $1
       UNION ALL
       SELECT u.id, u.name, u.image, m.role FROM "user" u
         JOIN board_member m ON m.user_id = u.id WHERE m.board_id = $1`,
      [boardId],
    );
    const revision = await client.query(`SELECT revision FROM board WHERE id = $1`, [boardId]);
    return {
      board, columns: columnSchema.array().parse(columns.rows), tasks: taskSchema.array().parse(tasks.rows),
      members: memberSchema.array().parse(members.rows),
      revision: z.object({ revision: z.number() }).parse(revision.rows[0]).revision,
    };
  });
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `SELECT b.title, i.role, i.expires_at AS "expiresAt"
     FROM board_invite i JOIN board b ON b.id = i.board_id
     WHERE i.token_hash = $1 AND i.email IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`,
    [tokenHash],
  );
  if (!result.rows[0]) return null;
  return z.object({ title: z.string(), role: z.enum(["viewer", "editor"]), expiresAt: timestamp })
    .parse(result.rows[0]);
}

export async function getProfile(userId: string): Promise<Profile> {
  const result = await pool.query(`SELECT bio, avatar_color AS "avatarColor" FROM profile WHERE user_id = $1`, [userId]);
  return result.rows[0]
    ? z.object({ bio: z.string(), avatarColor: color }).parse(result.rows[0])
    : { bio: "", avatarColor: "yellow" };
}
