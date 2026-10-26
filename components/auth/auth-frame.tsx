import Link from "next/link";
import { StickyNote } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthFrame({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-5">
    <Link href="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight"><StickyNote className="size-6" aria-hidden="true" />twello</Link>
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
    <p className="text-sm text-muted-foreground">A place to stick your next big thing.</p>
  </main>;
}
