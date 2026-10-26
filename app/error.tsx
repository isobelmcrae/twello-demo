"use client";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="flex min-h-svh items-center justify-center p-6"><div className="flex max-w-md flex-col gap-4"><Alert variant="destructive"><AlertTitle>Something went wrong</AlertTitle><AlertDescription>We couldn't load your workspace. Try again in a moment.</AlertDescription></Alert><Button onClick={reset}>Try again</Button></div></main>}
