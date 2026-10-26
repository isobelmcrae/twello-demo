"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, CheckCheckIcon, Columns3Icon, LayoutGridIcon, UsersIcon } from "lucide-react";
import type { BoardSummary, User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CreateBoardDialog } from "./shared";

export function Dashboard({ boards, user }: { boards: BoardSummary[]; user: User }) {
  const [search, setSearch] = useState("");
  const filtered = boards.filter(board => `${board.title} ${board.description}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="dashboard">
    <div className="page-topline"><span><LayoutGridIcon />Workspace</span><span>{boards.length} {boards.length === 1 ? "board" : "boards"}</span></div>
    <header className="page-heading"><div><h1>Your boards</h1><p>Hey {user.name.split(" ")[0] || user.name}. Make room for what&apos;s next.</p></div><CreateBoardDialog /></header>
    <div className="dashboard-toolbar"><h2>All boards <span>{boards.length}</span></h2><Field className="max-w-64"><FieldLabel className="sr-only" htmlFor="board-search">Search boards</FieldLabel><Input id="board-search" type="search" placeholder="Search boards…" value={search} onChange={event => setSearch(event.target.value)} /></Field></div>
    {filtered.length ? <div className="board-grid">{filtered.map(board => <Link href={`/boards/${board.id}`} key={board.id} className="board-link"><Card className="h-full">
      <div className="board-preview" data-color={board.color} aria-hidden="true"><div className="preview-column"><span /><i /><i /></div><div className="preview-column"><span /><i /></div><div className="preview-column"><span /><i /><i /></div><ArrowUpRightIcon /></div>
      <CardHeader><div className="flex items-start justify-between gap-3"><CardTitle>{board.title}</CardTitle><Badge variant="outline">{board.role}</Badge></div><CardDescription>{board.description || "No description yet."}</CardDescription></CardHeader>
      <CardContent><div className="board-progress"><span>{board.completedCount} of {board.taskCount} notes done</span><span>{board.taskCount ? Math.round(board.completedCount / board.taskCount * 100) : 0}%</span></div><div className="progress-track"><div style={{ width: `${board.taskCount ? board.completedCount / board.taskCount * 100 : 0}%` }} /></div></CardContent>
      <CardFooter className="justify-between"><span className="board-card-meta"><UsersIcon />{board.memberCount} {board.memberCount === 1 ? "member" : "members"}</span><span className="board-card-meta"><CheckCheckIcon />{board.completedCount} done</span></CardFooter>
    </Card></Link>)}</div> : <Empty className="min-h-80"><EmptyHeader><EmptyMedia variant="icon"><Columns3Icon /></EmptyMedia><EmptyTitle>{search ? "No boards found" : "Your first board starts here"}</EmptyTitle><EmptyDescription>{search ? "Try a different board name." : "Create a board, add a few notes, and invite your team."}</EmptyDescription></EmptyHeader>{!search && <EmptyContent><CreateBoardDialog /></EmptyContent>}</Empty>}
  </div>;
}
