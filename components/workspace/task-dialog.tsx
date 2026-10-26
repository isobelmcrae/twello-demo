"use client";

import { useState } from "react";
import { ArrowRightIcon, Trash2Icon } from "lucide-react";
import { createTask, deleteTask, moveTask, updateTask } from "@/lib/actions";
import type { BoardSnapshot, NoteColor, Task, TaskInput } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { ColorPicker } from "./shared";
import type { RunBoardAction } from "./use-board";

export type TaskEditor = { kind: "new"; columnId: string } | { kind: "edit"; task: Task };
export function TaskDialog({ editor, snapshot, pending, run, onClose }: { editor: TaskEditor; snapshot: BoardSnapshot; pending: boolean; run: RunBoardAction; onClose: () => void }) {
  const task = editor.kind === "edit" ? editor.task : null;
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [color, setColor] = useState<NoteColor>(task?.color || "yellow");
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) || "");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || "unassigned");
  const [version, setVersion] = useState(task?.version || 0);
  const [destination, setDestination] = useState(task?.columnId || (editor.kind === "new" ? editor.columnId : ""));
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current = task ? snapshot.tasks.find(item => item.id === task.id) : null;
  const canEdit = snapshot.board.role !== "viewer";
  const hasUnsavedChanges = !!current && (title !== current.title || description !== current.description || color !== current.color || dueDate !== (current.dueDate?.slice(0, 10) || "") || assigneeId !== (current.assigneeId || "unassigned"));
  const deleted = !!task && !current;
  const loadCurrent = () => {
    if (!current) return;
    setTitle(current.title); setDescription(current.description); setColor(current.color); setDueDate(current.dueDate?.slice(0, 10) || ""); setAssigneeId(current.assigneeId || "unassigned"); setVersion(current.version); setDestination(current.columnId); setConflict(false);
  };
  return <>
    <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{task ? "Note details" : "New note"}</DialogTitle><DialogDescription>{task ? `In ${snapshot.columns.find(column => column.id === (current?.columnId || task.columnId))?.title || "this board"}` : "One thing to move forward."}</DialogDescription></DialogHeader>
      {deleted && <Alert variant="destructive"><AlertTitle>This note was deleted.</AlertTitle><AlertDescription>Your draft is still here so you can copy it before closing.</AlertDescription></Alert>}
      {conflict && <Alert><AlertTitle>This note changed while you were editing.</AlertTitle><AlertDescription><p>Your draft is preserved. Copy anything you want to keep before loading the latest version.</p><Button variant="outline" size="sm" onClick={loadCurrent}>Load current version</Button></AlertDescription></Alert>}
      <form className="flex flex-col gap-5" onSubmit={async event => {
        event.preventDefault();
        const input: TaskInput = { title: title.trim(), description, color, dueDate: dueDate || null, assigneeId: assigneeId === "unassigned" ? null : assigneeId };
        const result = await run(() => task ? updateTask({ boardId: snapshot.board.id, taskId: task.id, expectedVersion: version, ...input }) : createTask({ boardId: snapshot.board.id, columnId: destination, ...input }));
        if (result.ok) onClose(); else if (result.code === "CONFLICT" || result.error.toLowerCase().includes("changed") || result.error.toLowerCase().includes("updated")) setConflict(true);
      }}><FieldGroup>
        <Field data-disabled={!canEdit}><FieldLabel htmlFor="task-title">Title</FieldLabel><Input id="task-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" required maxLength={200} disabled={pending || !canEdit || deleted} autoFocus /></Field>
        <Field data-disabled={!canEdit}><FieldLabel htmlFor="task-description">Description</FieldLabel><Textarea id="task-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Add context, links, or a few details…" maxLength={10000} disabled={pending || !canEdit || deleted} className="min-h-28" /></Field>
        <Field><FieldLabel>Note color</FieldLabel><ColorPicker value={color} onChange={setColor} disabled={pending || !canEdit || deleted} /></Field>
        <Field><FieldLabel htmlFor="task-assignee">Assigned to</FieldLabel><Select value={assigneeId} onValueChange={setAssigneeId} disabled={pending || !canEdit || deleted}><SelectTrigger id="task-assignee" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="unassigned">Unassigned</SelectItem>{snapshot.members.map(member => <SelectItem key={member.id} value={member.id}>{member.name}{member.role === "viewer" ? " (viewer)" : ""}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="task-due">Due date</FieldLabel><Input id="task-due" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={pending || !canEdit || deleted} /></Field>
      </FieldGroup>
      <DialogFooter>{task && canEdit && <Button variant="destructive" type="button" className="sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={pending || deleted}><Trash2Icon data-icon="inline-start" />Delete</Button>}<Button variant="outline" type="button" onClick={onClose} disabled={pending}>Close</Button>{canEdit && <Button type="submit" disabled={pending || !title.trim() || deleted}>{pending ? "Saving…" : task ? "Save changes" : "Add note"}</Button>}</DialogFooter></form>
      {task && canEdit && !deleted && <><Separator /><FieldGroup><Field><FieldLabel htmlFor="task-move">Move note to</FieldLabel><div className="flex gap-2"><Select value={destination} onValueChange={setDestination} disabled={pending}><SelectTrigger id="task-move" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{snapshot.columns.map(column => <SelectItem key={column.id} value={column.id}>{column.title}{column.isDone ? " ✓" : ""}</SelectItem>)}</SelectGroup></SelectContent></Select><Button variant="outline" disabled={pending || hasUnsavedChanges || destination === current?.columnId} onClick={async () => {
        const result = await run(() => moveTask({ boardId: snapshot.board.id, taskId: task.id, expectedVersion: version, columnId: destination, beforeTaskId: null }));
        if (result.ok) onClose(); else if (result.code === "CONFLICT") setConflict(true);
      }}><ArrowRightIcon data-icon="inline-start" />Move</Button></div><p className="form-hint">Moving closes this note. Save any edits first.</p></Field></FieldGroup></>}
    </DialogContent></Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this note?</AlertDialogTitle><AlertDialogDescription>This permanently removes the note and its details.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Keep note</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={async event => { event.preventDefault(); if (!task) return; const result = await run(() => deleteTask({ boardId: snapshot.board.id, taskId: task.id, expectedVersion: version })); if (result.ok) { setConfirmDelete(false); onClose(); } else { setConfirmDelete(false); if (result.code === "CONFLICT") setConflict(true); } }}>Delete note</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
