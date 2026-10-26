"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, LinkIcon, Trash2Icon, UserMinusIcon } from "lucide-react";
import { toast } from "sonner";
import { createColumn, createInvite, deleteBoard, deleteColumn, listInvites, removeMember, revokeInvite, updateBoard, updateColumn, updateMember } from "@/lib/actions";
import type { BoardSnapshot, Column, Invite } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColorPicker, UserAvatar } from "./shared";
import type { RunBoardAction } from "./use-board";

type DialogProps = { snapshot: BoardSnapshot; pending: boolean; run: RunBoardAction; onClose: () => void };
export function ColumnDialog({ column, snapshot, pending, run, onClose }: DialogProps & { column: Column | null }) {
  const [title, setTitle] = useState(column?.title || "");
  const [isDone, setIsDone] = useState(column?.isDone || false);
  const [deleting, setDeleting] = useState(false);
  const hasTasks = !!column && snapshot.tasks.some(task => task.columnId === column.id);
  return <><Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{column ? "Edit list" : "New list"}</DialogTitle><DialogDescription>Give your notes a place in the process.</DialogDescription></DialogHeader><form className="flex flex-col gap-5" onSubmit={async event => { event.preventDefault(); const result = await run(() => column ? updateColumn({ boardId: snapshot.board.id, columnId: column.id, title: title.trim(), isDone }) : createColumn({ boardId: snapshot.board.id, title: title.trim() })); if (result.ok) onClose(); }}><FieldGroup>
    <Field><FieldLabel htmlFor="column-title">List name</FieldLabel><Input id="column-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={80} disabled={pending} autoFocus placeholder="e.g. In review" /></Field>
    {column && <Field><FieldLabel>Notes in this list are</FieldLabel><ToggleGroup variant="outline" type="single" value={isDone ? "done" : "active"} onValueChange={value => { if (value) setIsDone(value === "done"); }} disabled={pending}><ToggleGroupItem value="active">In progress</ToggleGroupItem><ToggleGroupItem value="done">Completed</ToggleGroupItem></ToggleGroup><FieldDescription>Completed lists count toward the board&apos;s progress.</FieldDescription></Field>}
  </FieldGroup><DialogFooter>{column && <Button type="button" variant="destructive" disabled={pending || hasTasks} onClick={() => setDeleting(true)} className="sm:mr-auto" title={hasTasks ? "Move or delete all notes in this list first." : undefined}><Trash2Icon data-icon="inline-start" />Delete list</Button>}<Button variant="outline" type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !title.trim()}>{pending ? "Saving…" : column ? "Save list" : "Add list"}</Button></DialogFooter></form>{hasTasks && <p className="form-hint">Move or delete all notes before deleting this list.</p>}</DialogContent></Dialog>
  <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this list?</AlertDialogTitle><AlertDialogDescription>The empty list will be permanently removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={async event => { event.preventDefault(); if (!column) return; const result = await run(() => deleteColumn({ boardId: snapshot.board.id, columnId: column.id })); if (result.ok) onClose(); }}>Delete list</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

export function BoardSettingsDialog({ snapshot, pending, run, onClose }: DialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState(snapshot.board.title);
  const [description, setDescription] = useState(snapshot.board.description);
  const [color, setColor] = useState(snapshot.board.color);
  const [deleting, setDeleting] = useState(false);
  return <><Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Board settings</DialogTitle><DialogDescription>Keep the board clear and easy to find.</DialogDescription></DialogHeader><form className="flex flex-col gap-5" onSubmit={async event => { event.preventDefault(); const result = await run(() => updateBoard({ boardId: snapshot.board.id, title: title.trim(), description, color })); if (result.ok) { onClose(); router.refresh(); } }}><FieldGroup>
    <Field><FieldLabel htmlFor="board-title">Board name</FieldLabel><Input id="board-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={120} disabled={pending} /></Field><Field><FieldLabel htmlFor="board-description">Description</FieldLabel><Textarea id="board-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} disabled={pending} /></Field><Field><FieldLabel>Board color</FieldLabel><ColorPicker value={color} onChange={setColor} disabled={pending} /></Field>
  </FieldGroup><DialogFooter><Button variant="destructive" type="button" onClick={() => setDeleting(true)} disabled={pending} className="sm:mr-auto"><Trash2Icon data-icon="inline-start" />Delete board</Button><Button variant="outline" type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save changes"}</Button></DialogFooter></form></DialogContent></Dialog>
  <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete &quot;{snapshot.board.title}&quot;?</AlertDialogTitle><AlertDialogDescription>Every note, list, membership, and invite on this board will be permanently deleted. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Keep board</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={async event => { event.preventDefault(); const result = await run(() => deleteBoard({ boardId: snapshot.board.id })); if (result.ok) { onClose(); router.push("/"); router.refresh(); } }}>Delete board</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

export function ShareDialog({ snapshot, pending, run, onClose }: DialogProps) {
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [link, setLink] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BoardSnapshot["members"][number] | null>(null);
  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    try { const result = await listInvites({ boardId: snapshot.board.id }); if (result.ok) { setInvites(result.data); setInviteError(null); } else setInviteError(result.error); } catch { setInviteError("Could not load invitation links."); } finally { setLoadingInvites(false); }
  }, [snapshot.board.id]);
  useEffect(() => { void loadInvites(); }, [loadInvites]);
  async function copyLink(value: string) { try { await navigator.clipboard.writeText(value); toast.success("Invite link copied."); } catch { toast.error("Could not copy. Select and copy the link below."); } }
  return <><Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Share this board</DialogTitle><DialogDescription>Create an invite link with the access you choose.</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={async event => { event.preventDefault(); const result = await run(() => createInvite({ boardId: snapshot.board.id, role })); if (!result.ok) return; setLink(result.data.url); toast.success("Invite link created."); await loadInvites(); }}><FieldGroup>
      <Field><FieldLabel htmlFor="invite-role">Permission</FieldLabel><Select value={role} onValueChange={value => { if (value === "editor" || value === "viewer") setRole(value); }} disabled={pending}><SelectTrigger id="invite-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="editor">Editor · can add and change notes</SelectItem><SelectItem value="viewer">Viewer · can view the board</SelectItem></SelectGroup></SelectContent></Select></Field>
    </FieldGroup><Button type="submit" disabled={pending}><LinkIcon data-icon="inline-start" />{pending ? "Creating invite…" : "Create invite link"}</Button></form>
    {link && <FieldGroup><Field><FieldLabel htmlFor="invite-link">Invitation link</FieldLabel><Input id="invite-link" readOnly value={link} onFocus={event => event.target.select()} /><Button variant="outline" onClick={() => void copyLink(link)}><CopyIcon data-icon="inline-start" />Copy link</Button><FieldDescription>Links expire after 7 days. Anyone with a general link can join with the permission above.</FieldDescription></Field></FieldGroup>}
    <Separator /><div className="flex flex-col gap-3"><h3 className="section-title">Members <span>{snapshot.members.length}</span></h3>{snapshot.members.map(member => <div key={member.id} className="member-row"><UserAvatar user={member} /><div className="min-w-0 flex-1"><strong className="member-name">{member.name}</strong></div>{member.role === "owner" ? <Badge variant="secondary">Owner</Badge> : <><Select value={member.role} disabled={pending} onValueChange={async value => { if (value === "viewer" || value === "editor") await run(() => updateMember({ boardId: snapshot.board.id, userId: member.id, role: value })); }}><SelectTrigger aria-label={`Permission for ${member.name}`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="editor">Editor</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectGroup></SelectContent></Select><Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`} disabled={pending} onClick={() => setRemoving(member)}><UserMinusIcon /></Button></>}</div>)}</div>
    <Separator /><div className="flex flex-col gap-3"><h3 className="section-title">Active invitations</h3>{loadingInvites && <p className="form-hint" role="status">Loading invitations…</p>}{inviteError && <Alert variant="destructive"><AlertDescription>{inviteError}<Button variant="outline" size="sm" onClick={() => void loadInvites()}>Try again</Button></AlertDescription></Alert>}{!loadingInvites && !inviteError && !invites.length && <p className="form-hint">No active invitations.</p>}{invites.map(invite => <div className="invite-row" key={invite.id}><LinkIcon /><div className="min-w-0 flex-1"><strong className="member-name">Anyone with the link</strong><p className="member-email">{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></div><Button variant="ghost" size="sm" disabled={pending} onClick={async () => { const result = await run(() => revokeInvite({ boardId: snapshot.board.id, inviteId: invite.id })); if (result.ok) { setLink(null); await loadInvites(); toast.success("Invite revoked."); } }}>Revoke</Button></div>)}</div>
    <DialogFooter><Button variant="outline" onClick={onClose} disabled={pending}>Done</Button></DialogFooter>
  </DialogContent></Dialog><AlertDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle><AlertDialogDescription>They will lose access to this board. You can invite them again later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={async event => { event.preventDefault(); if (!removing) return; const result = await run(() => removeMember({ boardId: snapshot.board.id, userId: removing.id })); if (result.ok) setRemoving(null); }}>Remove member</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
