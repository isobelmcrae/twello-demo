"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createBoard } from "@/lib/actions";
import { NOTE_COLORS, type NoteColor, type User } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function UserAvatar({ user, size = "default" }: { user: Pick<User, "name" | "image">; size?: "default" | "sm" | "lg" }) {
  return <Avatar size={size} title={user.name}>
    {user.image && <AvatarImage src={user.image} alt={user.name} />}
    <AvatarFallback>{user.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "?"}</AvatarFallback>
  </Avatar>;
}

export function ColorPicker({ value, onChange, disabled = false }: { value: NoteColor; onChange: (color: NoteColor) => void; disabled?: boolean }) {
  return <ToggleGroup type="single" variant="outline" value={value} disabled={disabled} onValueChange={next => {
    const color = NOTE_COLORS.find(color => color === next);
    if (color) onChange(color);
  }} aria-label="Note color">
    {NOTE_COLORS.map(color => <ToggleGroupItem key={color} value={color} aria-label={color} title={color}>
      <span className="color-swatch" data-color={color} />
    </ToggleGroupItem>)}
  </ToggleGroup>;
}

export function CreateBoardDialog({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<NoteColor>("yellow");
  const [pending, setPending] = useState(false);
  return <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
    <DialogTrigger asChild><Button variant={compact ? "ghost" : "default"} size={compact ? "icon-sm" : "default"} aria-label="Create board"><PlusIcon data-icon="inline-start" />{!compact && "New board"}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>New board</DialogTitle><DialogDescription>A place for your team&apos;s next project.</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-5" onSubmit={async event => {
        event.preventDefault(); setPending(true);
        try {
          const result = await createBoard({ title: title.trim(), description, color });
          if (!result.ok) { toast.error(result.error); return; }
          setOpen(false); setTitle(""); setDescription("");
          router.push(`/boards/${result.data.id}`); router.refresh();
        } catch { toast.error("Could not create the board. Try again."); } finally { setPending(false); }
      }}>
        <FieldGroup>
          <Field><FieldLabel htmlFor={`${id}-title`}>Board name</FieldLabel><Input id={`${id}-title`} placeholder="e.g. Product launch" value={title} onChange={event => setTitle(event.target.value)} required maxLength={120} autoFocus disabled={pending} /></Field>
          <Field><FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel><Textarea id={`${id}-description`} placeholder="What are we working on?" value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} disabled={pending} /></Field>
          <Field><FieldLabel>Board color</FieldLabel><ColorPicker value={color} onChange={setColor} disabled={pending} /><FieldDescription>You can change this later.</FieldDescription></Field>
        </FieldGroup>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !title.trim()}>{pending ? "Creating…" : "Create board"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
