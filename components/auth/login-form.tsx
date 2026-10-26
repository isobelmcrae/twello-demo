"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setPending(true); setError("");
    try {
      const callbackURL = `${window.location.origin}${nextPath}`;
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: String(form.get("name") || "").trim(), email, password, callbackURL })
        : await authClient.signIn.email({ email, password, callbackURL });
      if (result.error) {
        setError(result.error.message || "Unable to sign in. Try again.");
      } else {
        router.push(nextPath); router.refresh();
      }
    } catch { setError("Could not connect. Try again in a moment."); }
    finally { setPending(false); }
  }
  return <div className="flex flex-col gap-5">
    <Tabs value={mode} onValueChange={value => {setMode(value);setError("");}}><TabsList className="w-full"><TabsTrigger value="login" className="flex-1">Sign in</TabsTrigger><TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger></TabsList></Tabs>
    <form onSubmit={submit}>
      <FieldGroup>
        {mode === "signup" && <Field><FieldLabel htmlFor="name">Your name</FieldLabel><Input id="name" name="name" autoComplete="name" maxLength={80} required /></Field>}
        <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></Field>
        <Field><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 10 : 1} maxLength={128} required />{mode === "signup" && <FieldDescription>At least 10 characters.</FieldDescription>}</Field>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button type="submit" disabled={pending}>{pending && <Loader2 data-icon="inline-start" className="animate-spin" />}{mode === "signup" ? "Create account" : "Sign in"}</Button>
      </FieldGroup>
    </form>
  </div>;
}
