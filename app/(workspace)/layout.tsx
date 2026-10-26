import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBoards } from "@/lib/boards";
import { WorkspaceShell } from "@/components/workspace/shell";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){
 const session=await getSession();
 if(!session)redirect("/login");
 const boards=await listBoards(session.user.id);
 const user={id:session.user.id,name:session.user.name,email:session.user.email,image:session.user.image??null};
 return <WorkspaceShell user={user} boards={boards}>{children}</WorkspaceShell>;
}
