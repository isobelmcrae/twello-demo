import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const session = await getSession();
  if (session) redirect(nextPath);
  return <AuthFrame title="Your team. On the same board." description="Sign in to your workspace or make an account."><LoginForm nextPath={nextPath} /></AuthFrame>;
}
