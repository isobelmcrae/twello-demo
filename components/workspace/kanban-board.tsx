"use client";

import { useState } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckIcon, ChevronRightIcon, Columns3Icon, GripVerticalIcon, MoreHorizontalIcon, PlusIcon, Settings2Icon, Share2Icon, StickyNoteIcon } from "lucide-react";
import { moveTask } from "@/lib/actions";
import type { BoardSnapshot, Column, Member, Task, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BoardSettingsDialog, ColumnDialog, ShareDialog } from "./board-dialogs";
import { UserAvatar } from "./shared";
import { TaskDialog, type TaskEditor } from "./task-dialog";
import { useBoard } from "./use-board";

type BoardDialog = { kind: "task"; editor: TaskEditor } | { kind: "column"; column: Column | null } | { kind: "share" } | { kind: "settings" } | null;
const collisionDetection: CollisionDetection = args => {
  const hits = pointerWithin(args);
  const notes = hits.filter(hit => !String(hit.id).startsWith("column:"));
  return notes.length ? notes : hits.length ? hits : closestCorners(args);
};

function NoteContent({ task, assignee, done }: { task: Task; assignee: Member | undefined; done: boolean }) {
  const overdue = !!task.dueDate && !done && task.dueDate.slice(0, 10) < new Date().toLocaleDateString("en-CA");
  return <><div className="note-top"><span className="note-color-label">{done ? "Completed" : "Note"}</span>{done && <CheckIcon className="size-3.5" />}</div><h3>{task.title}</h3>{task.description && <p className="note-description">{task.description}</p>}<div className="note-footer"><div className="flex min-w-0 items-center gap-1.5">{task.dueDate && <Badge variant={overdue ? "destructive" : "outline"}>{new Date(`${task.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Badge>}{!task.dueDate && <span className="note-footer-empty" aria-hidden="true">&nbsp;</span>}</div>{assignee && <UserAvatar user={assignee} size="sm" />}</div></>;
}

function SortableNote({ task, assignee, done, canEdit, disabled, onOpen }: { task: Task; assignee: Member | undefined; done: boolean; canEdit: boolean; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit || disabled });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("sticky-note", isDragging && "is-dragging")} data-color={task.color} data-done={done}>
    <button type="button" className="note-open" onClick={onOpen} aria-label={`Open note: ${task.title}`}><NoteContent task={task} assignee={assignee} done={done} /></button>
    {canEdit && <Button ref={setActivatorNodeRef} variant="ghost" size="icon-sm" className="note-drag-handle" aria-label={`Drag ${task.title}`} {...attributes} {...listeners} disabled={disabled}><GripVerticalIcon /></Button>}
  </article>;
}

function BoardColumn({ column, tasks, members, canEdit, pending, onOpen, onAdd, onEdit, total }: { column: Column; tasks: Task[]; members: Member[]; canEdit: boolean; pending: boolean; onOpen: (task: Task) => void; onAdd: () => void; onEdit: () => void; total: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}`, disabled: !canEdit || pending });
  return <section ref={setNodeRef} className={cn("kanban-column", isOver && "is-over")} aria-label={`${column.title} list`}>
    <header className="column-header"><div className="flex min-w-0 items-center gap-2"><span className={cn("column-status-dot", column.isDone && "is-done")} /><h2 className="truncate">{column.title}</h2><span className="column-count">{total}</span></div>{canEdit && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${column.title} list`} onClick={onEdit} disabled={pending}><MoreHorizontalIcon /></Button>}</header>
    <div className="column-notes"><SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>{tasks.map(task => <SortableNote key={task.id} task={task} assignee={members.find(member => member.id === task.assigneeId)} done={column.isDone} canEdit={canEdit} disabled={pending} onOpen={() => onOpen(task)} />)}</SortableContext>{tasks.length === 0 && <div className="list-empty">{total ? "No matching notes" : "A little room for what’s next."}</div>}</div>
    {canEdit && <Button variant="ghost" className="w-full justify-start" disabled={pending} onClick={onAdd}><PlusIcon data-icon="inline-start" />Add note</Button>}
  </section>;
}

export function KanbanBoard({ initial, user }: { initial: BoardSnapshot; user: User }) {
  const { snapshot, pending, error, accessLost, refresh, run, dragActive } = useBoard(initial);
  const [dialog, setDialog] = useState<BoardDialog>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dragged, setDragged] = useState<Task | null>(null);
  const canEdit = snapshot.board.role !== "viewer";
  const isOwner = snapshot.board.role === "owner";
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 7 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const filtered = snapshot.tasks.filter(task => (filter !== "mine" || task.assigneeId === user.id) && `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase()));
  const orderedColumns = [...snapshot.columns].sort((a, b) => a.position - b.position);
  async function onDragEnd(event: DragEndEvent) {
    dragActive.current = false; setDragged(null);
    if (!event.over || !canEdit || pending) return;
    const task = snapshot.tasks.find(task => task.id === String(event.active.id));
    const targetTask = snapshot.tasks.find(task => task.id === String(event.over?.id));
    const columnId = targetTask?.columnId || (String(event.over.id).startsWith("column:") ? String(event.over.id).slice(7) : null);
    if (!task || !columnId || task.id === targetTask?.id) return;
    const targetTasks = snapshot.tasks.filter(item => item.columnId === columnId && item.id !== task.id).sort((a, b) => a.position - b.position);
    let beforeTaskId = targetTask?.id || null;
    if (targetTask && task.columnId === columnId && task.position < targetTask.position) {
      const nextTask = targetTasks[targetTasks.findIndex(item => item.id === targetTask.id) + 1];
      beforeTaskId = nextTask?.id || null;
    }
    await run(() => moveTask({ boardId: snapshot.board.id, taskId: task.id, columnId, beforeTaskId, expectedVersion: task.version }));
  }
  if (accessLost) return <div className="dashboard"><Empty className="min-h-96"><EmptyHeader><EmptyMedia variant="icon"><Columns3Icon /></EmptyMedia><EmptyTitle>This board is no longer available</EmptyTitle><EmptyDescription>It may have been deleted, or your permission has changed.</EmptyDescription></EmptyHeader><Button asChild><Link href="/">Back to your boards</Link></Button></Empty></div>;
  return <div className="board-page">
    <div className="page-topline"><span><Link href="/">All boards</Link><ChevronRightIcon />{snapshot.board.title}</span><span className="live-status" role="status" aria-live="polite"><i data-paused={!!error} />{pending ? "Saving…" : error ? "Reconnecting" : "Live updates"}</span></div>
    <header className="board-heading"><div className="board-title-group"><div className="board-title-icon" data-color={snapshot.board.color}><Columns3Icon /></div><div><h1>{snapshot.board.title}</h1>{snapshot.board.description && <p>{snapshot.board.description}</p>}</div></div><div className="flex shrink-0 items-center gap-2"><AvatarGroup>{snapshot.members.slice(0, 4).map(member => <UserAvatar key={member.id} user={member} />)}{snapshot.members.length > 4 && <AvatarGroupCount>+{snapshot.members.length - 4}</AvatarGroupCount>}</AvatarGroup>{isOwner && <><Button variant="outline" onClick={() => setDialog({ kind: "share" })} disabled={pending}><Share2Icon data-icon="inline-start" />Share</Button><Button variant="ghost" size="icon" aria-label="Board settings" onClick={() => setDialog({ kind: "settings" })} disabled={pending}><Settings2Icon /></Button></>}</div></header>
    <div className="board-toolbar"><div className="flex flex-wrap items-center gap-3"><span className="board-view"><Columns3Icon />Board</span><Badge variant="secondary">{snapshot.tasks.length} notes</Badge><Badge variant="outline">{snapshot.board.role}</Badge></div><div className="flex flex-wrap items-center gap-3"><ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={value => { if (value) setFilter(value); }} aria-label="Filter notes"><ToggleGroupItem value="all">All notes</ToggleGroupItem><ToggleGroupItem value="mine">Assigned to me</ToggleGroupItem></ToggleGroup><Field className="w-48"><FieldLabel htmlFor="task-search" className="sr-only">Search notes</FieldLabel><Input id="task-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes…" /></Field></div></div>
    <Separator />
    {error && <div className="px-5 pt-4 md:px-8"><Alert><AlertTitle>Waiting to reconnect</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" className="ml-2" onClick={() => void refresh()}>Retry now</Button></AlertDescription></Alert></div>}
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={event => { dragActive.current = true; setDragged(snapshot.tasks.find(task => task.id === String(event.active.id)) || null); }} onDragCancel={() => { dragActive.current = false; setDragged(null); }} onDragEnd={event => void onDragEnd(event)}>
      <div className="kanban-canvas"><div className="kanban-lists">{orderedColumns.map(column => <BoardColumn key={column.id} column={column} tasks={filtered.filter(task => task.columnId === column.id).sort((a, b) => a.position - b.position)} members={snapshot.members} total={snapshot.tasks.filter(task => task.columnId === column.id).length} canEdit={canEdit} pending={pending} onOpen={task => setDialog({ kind: "task", editor: { kind: "edit", task } })} onAdd={() => setDialog({ kind: "task", editor: { kind: "new", columnId: column.id } })} onEdit={() => setDialog({ kind: "column", column })} />)}{canEdit && <div className="add-list"><Button variant="outline" disabled={pending} onClick={() => setDialog({ kind: "column", column: null })}><PlusIcon data-icon="inline-start" />Add list</Button></div>}{!orderedColumns.length && !canEdit && <Empty><EmptyHeader><EmptyMedia variant="icon"><StickyNoteIcon /></EmptyMedia><EmptyTitle>No lists yet</EmptyTitle><EmptyDescription>The team hasn&apos;t added any notes to this board yet.</EmptyDescription></EmptyHeader></Empty>}</div></div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>{dragged && <article className="sticky-note note-overlay" data-color={dragged.color}><div className="note-open"><NoteContent task={dragged} assignee={snapshot.members.find(member => member.id === dragged.assigneeId)} done={snapshot.columns.find(column => column.id === dragged.columnId)?.isDone || false} /></div></article>}</DragOverlay>
    </DndContext>
    <footer className="board-footer"><span>{snapshot.tasks.filter(task => snapshot.columns.some(column => column.id === task.columnId && column.isDone)).length} of {snapshot.tasks.length} notes completed</span><span>{canEdit ? "Grab a note by its handle to move it." : "You have view-only access to this board."}</span></footer>
    {dialog?.kind === "task" && <TaskDialog key={dialog.editor.kind === "edit" ? dialog.editor.task.id : `new-${dialog.editor.columnId}`} editor={dialog.editor} snapshot={snapshot} pending={pending} run={run} onClose={() => setDialog(null)} />}
    {dialog?.kind === "column" && canEdit && <ColumnDialog column={dialog.column} snapshot={snapshot} pending={pending} run={run} onClose={() => setDialog(null)} />}
    {dialog?.kind === "share" && isOwner && <ShareDialog snapshot={snapshot} pending={pending} run={run} onClose={() => setDialog(null)} />}
    {dialog?.kind === "settings" && isOwner && <BoardSettingsDialog snapshot={snapshot} pending={pending} run={run} onClose={() => setDialog(null)} />}
  </div>;
}
