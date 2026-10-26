"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { saveProfile } from "@/lib/profile-actions";
import type { Profile, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker, UserAvatar } from "./shared";

export function ProfileForm({ user, profile }: { user: User; profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [image, setImage] = useState(user.image || "");
  const [bio, setBio] = useState(profile.bio);
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [pending, setPending] = useState(false);
  return <div className="dashboard"><div className="page-topline"><span><UserRoundIcon />My profile</span></div><header className="page-heading"><div><h1>Make yourself at home.</h1><p>This is how you appear to your team.</p></div></header>
    <form className="max-w-xl" onSubmit={async event => {
      event.preventDefault(); setPending(true);
      try { const result = await saveProfile({ name: name.trim(), image: image.trim() || null, bio, avatarColor }); if (!result.ok) { toast.error(result.error); return; } toast.success("Profile saved."); router.refresh(); } catch { toast.error("Could not save your profile. Try again."); } finally { setPending(false); }
    }}><Card><CardHeader><CardTitle>Personal details</CardTitle><CardDescription>Choose how you appear on your boards.</CardDescription></CardHeader><CardContent><FieldGroup>
      <Field><FieldLabel>Profile preview</FieldLabel><div className="profile-preview" data-color={avatarColor}><UserAvatar user={{ name, image: image || null }} size="lg" /><div><strong>{name || "Your name"}</strong><p>{bio || "A little about you."}</p></div></div></Field>
      <Field><FieldLabel htmlFor="profile-name">Name</FieldLabel><Input id="profile-name" required maxLength={80} autoComplete="name" value={name} onChange={event => setName(event.target.value)} disabled={pending} /></Field>
      <Field><FieldLabel htmlFor="profile-bio">About you</FieldLabel><Textarea id="profile-bio" maxLength={500} value={bio} onChange={event => setBio(event.target.value)} placeholder="What do you do on the team?" disabled={pending} /></Field>
      <Field><FieldLabel htmlFor="profile-image">Photo URL</FieldLabel><Input id="profile-image" type="url" maxLength={2000} pattern="https://.*" value={image} onChange={event => setImage(event.target.value)} placeholder="https://…" disabled={pending} /><FieldDescription>Use a public HTTPS image link. Leave blank to use your initials.</FieldDescription></Field>
      <Field><FieldLabel>Profile color</FieldLabel><ColorPicker value={avatarColor} onChange={setAvatarColor} disabled={pending} /></Field>
    </FieldGroup></CardContent><CardFooter className="justify-end"><Button disabled={pending || !name.trim()} type="submit">{pending ? "Saving…" : "Save changes"}</Button></CardFooter></Card></form>
  </div>;
}
