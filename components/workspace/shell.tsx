"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRightIcon, Columns3Icon, LayoutGridIcon, LogOutIcon, MenuIcon, StickyNoteIcon, UserRoundIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import type { BoardSummary, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CreateBoardDialog, UserAvatar } from "./shared";

export function WorkspaceShell({ user, boards, children }: { user: User; boards: BoardSummary[]; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  return <div className="workspace-shell">
    <header className="mobile-header"><Link href="/" className="wordmark"><StickyNoteIcon />twello<span className="wordmark-dot" /></Link><Button variant="ghost" size="icon" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <XIcon /> : <MenuIcon />}</Button></header>
    {open && <button className="navigation-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={cn("workspace-sidebar", open && "is-open")} aria-label="Workspace navigation">
      <Link href="/" className="wordmark" onClick={() => setOpen(false)}><StickyNoteIcon />twello<span className="wordmark-dot" /></Link>
      <div className="workspace-label"><div className="workspace-monogram">T</div><div><strong>Team workspace</strong><span>One team, all your projects.</span></div></div>
      <nav className="flex flex-col gap-1" aria-label="Main"><Button asChild variant={path === "/" || path === "/boards" ? "secondary" : "ghost"} className="justify-start"><Link href="/" onClick={() => setOpen(false)}><LayoutGridIcon data-icon="inline-start" />All boards</Link></Button><Button asChild variant={path === "/profile" ? "secondary" : "ghost"} className="justify-start"><Link href="/profile" onClick={() => setOpen(false)}><UserRoundIcon data-icon="inline-start" />My profile</Link></Button></nav>
      <Separator />
      <div className="sidebar-section-heading"><span>Your boards</span><CreateBoardDialog compact /></div>
      <nav className="sidebar-board-list" aria-label="Boards">{boards.map(board => <Button key={board.id} asChild variant={path === `/boards/${board.id}` ? "secondary" : "ghost"} className="justify-start"><Link href={`/boards/${board.id}`} onClick={() => setOpen(false)}><span className="board-dot" data-color={board.color} /><span className="truncate">{board.title}</span></Link></Button>)}{boards.length === 0 && <p className="sidebar-hint">Your boards will appear here.</p>}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Columns3Icon /><p>Big ideas.<br />Small sticky notes.</p><ArrowUpRightIcon /></div><Separator /><div className="sidebar-user"><Link href="/profile" className="flex min-w-0 flex-1 items-center gap-2.5" onClick={() => setOpen(false)}><UserAvatar user={user} /><div className="min-w-0"><strong className="block truncate">{user.name}</strong></div></Link><Button variant="ghost" size="icon-sm" aria-label="Sign out" disabled={signingOut} onClick={async () => {
        setSigningOut(true);
        try { const result = await authClient.signOut(); if (result.error) { toast.error(result.error.message || "Could not sign out."); return; } router.push("/login"); router.refresh(); } catch { toast.error("Could not sign out. Try again."); } finally { setSigningOut(false); }
      }}><LogOutIcon /></Button></div></div>
    </aside>
    <main className="workspace-main">{children}</main>
  </div>;
}
