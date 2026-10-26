import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getInvitePreview } from "@/lib/boards";
import { AuthFrame } from "@/components/auth/auth-frame";
import { AcceptInvite } from "@/components/auth/accept-invite";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
export default async function InvitePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 const invite=await getInvitePreview(token);
 if(!invite)return <AuthFrame title="This invitation has expired" description="The link may have expired or been revoked. Ask the board owner for a new invitation."><Button asChild variant="outline"><Link href="/">Go to your boards</Link></Button></AuthFrame>;
 const session=await getSession();
 return <AuthFrame title={`You're invited to ${invite.title}`} description="Join your team on this board.">
  <div className="flex flex-col gap-5">
   <div className="flex items-center gap-2"><Badge variant="secondary">{invite.role}</Badge><span className="text-sm text-muted-foreground">{invite.role==="editor"?"Create, move, and edit tasks":"View tasks and board activity"}</span></div>
   <p className="text-sm text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleDateString("en-AU",{dateStyle:"long",timeZone:"UTC"})}.</p>
   {session?<AcceptInvite token={token}/>:<Button asChild><Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in or create an account</Link></Button>}
  </div>
 </AuthFrame>;
}
