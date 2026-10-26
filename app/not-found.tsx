import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
export default function NotFound(){return <main className="flex min-h-svh items-center justify-center p-6"><Empty><EmptyHeader><EmptyTitle>There's no board here</EmptyTitle><EmptyDescription>The board may have been removed, or you may need an invitation.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild><Link href="/">Go to your boards</Link></Button></EmptyContent></Empty></main>}
