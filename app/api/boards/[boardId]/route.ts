import { getSession } from "@/lib/auth";
import { getBoard } from "@/lib/boards";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(_request: Request, context: { params: Promise<{ boardId: string }> }) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Sign in to view this board." }, { status: 401, headers: responseHeaders });
    const { boardId } = await context.params;
    const board = await getBoard(boardId, session.user.id);
    if (!board) return Response.json({ error: "You no longer have access to this board." }, { status: 403, headers: responseHeaders });
    return Response.json(board, { headers: responseHeaders });
  } catch {
    return Response.json({ error: "The board could not be loaded. Try again." }, { status: 503, headers: responseHeaders });
  }
}
