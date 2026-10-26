"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export function PasswordForm({ token }: { token?: string }) {
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault(); setPending(true);setError("");
    const form=new FormData(event.currentTarget);
    try {
      const result=token
        ? await authClient.resetPassword({ newPassword: String(form.get("password")||""), token })
        : await authClient.requestPasswordReset({ email:String(form.get("email")||""), redirectTo:`${window.location.origin}/reset-password` });
      if(result.error)setError(result.error.message||"Something went wrong. Try again.");
      else setMessage(token?"Your password has been reset. You can sign in now.":"If an account exists, a reset link is on its way to your inbox.");
    } catch {setError("Could not connect. Try again.");} finally{setPending(false);}
  }
  return <form onSubmit={submit}><FieldGroup>
    {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : <>
      <Field><FieldLabel htmlFor="password-field">{token?"New password":"Email"}</FieldLabel><Input id="password-field" name={token?"password":"email"} type={token?"password":"email"} autoComplete={token?"new-password":"email"} minLength={token?10:undefined} maxLength={token?128:254} required />{token&&<FieldDescription>At least 10 characters.</FieldDescription>}</Field>
      {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" disabled={pending}>{pending&&<Loader2 data-icon="inline-start" className="animate-spin" />}{token?"Reset password":"Send reset link"}</Button>
    </>}
    <Button variant="link" asChild><Link href="/login">Back to sign in</Link></Button>
  </FieldGroup></form>;
}
