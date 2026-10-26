"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import type { ActionResult, BoardSnapshot } from "@/lib/types";

const color = z.enum(["yellow", "pink", "blue", "green", "violet"]);
const role = z.enum(["owner", "editor", "viewer"]);
const snapshotSchema = z.object({
  board: z.object({ id: z.string(), title: z.string(), description: z.string(), color, role, updatedAt: z.string(), taskCount: z.number(), completedCount: z.number(), memberCount: z.number() }),
  columns: z.array(z.object({ id: z.string(), title: z.string(), position: z.number(), isDone: z.boolean() })),
  tasks: z.array(z.object({ id: z.string(), boardId: z.string(), columnId: z.string(), title: z.string(), description: z.string(), color, position: z.number(), dueDate: z.string().nullable(), assigneeId: z.string().nullable(), version: z.number(), createdAt: z.string() })),
  members: z.array(z.object({ id: z.string(), name: z.string(), image: z.string().nullable(), role })), revision: z.number(),
});
export type RunBoardAction = <T>(work: () => Promise<ActionResult<T>>) => Promise<ActionResult<T>>;

export function useBoard(initial: BoardSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const busy = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const dragActive = useRef(false);
  const refresh = useCallback(async (afterMutation = false): Promise<void> => {
    if ((busy.current && !afterMutation) || dragActive.current || !mounted.current) return;
    if (inFlight.current) return inFlight.current;
    const controller = new AbortController();
    abort.current = controller;
    const requestGeneration = generation.current;
    const request = (async () => {
      try {
        const response = await fetch(`/api/boards/${initial.board.id}`, { cache: "no-store", signal: controller.signal });
        if (generation.current !== requestGeneration || (busy.current && !afterMutation) || dragActive.current || !mounted.current) return;
        if ([401, 403, 404].includes(response.status)) { setAccessLost(true); return; }
        if (!response.ok) throw new Error("Could not sync this board.");
        const body: unknown = await response.json();
        const next = snapshotSchema.parse(body);
        if (generation.current !== requestGeneration || (busy.current && !afterMutation) || dragActive.current || !mounted.current) return;
        setSnapshot(previous => next.revision >= previous.revision ? next : previous);
        setAccessLost(false); setError(null);
      } catch {
        if (!controller.signal.aborted && mounted.current && generation.current === requestGeneration) setError("Live updates are paused. Check your connection; we will keep trying.");
      }
    })();
    inFlight.current = request;
    try { await request; } finally { if (inFlight.current === request) { inFlight.current = null; abort.current = null; } }
  }, [initial.board.id]);
  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { mounted.current = false; abort.current?.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  const run: RunBoardAction = useCallback(async <T,>(work: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    if (busy.current) return { ok: false, error: "Another change is being saved. Try again in a moment." };
    busy.current = true; generation.current += 1; setPending(true);
    abort.current?.abort();
    if (inFlight.current) await inFlight.current;
    inFlight.current = null;
    let result: ActionResult<T>;
    try {
      result = await work();
      if (!result.ok) toast.error(result.error);
    } catch {
      result = { ok: false, error: "Could not save this change. Check your connection and try again." };
      toast.error(result.error);
    }
    try { await refresh(true); } finally { busy.current = false; if (mounted.current) setPending(false); }
    return result;
  }, [refresh]);
  return { snapshot, pending, error, accessLost, refresh, run, dragActive };
}
