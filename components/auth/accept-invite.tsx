"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { acceptInvite } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function AcceptInvite({token}:{token:string}){
 const router=useRouter();
 const [pending,setPending]=useState(false);
 const [error,setError]=useState("");
 return <div className="flex flex-col gap-4">{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button disabled={pending} onClick={async()=>{
   setPending(true);setError("");
   try{const result=await acceptInvite({token});if(!result.ok){setError(result.error);setPending(false);return;}router.push(`/boards/${result.data.boardId}`);router.refresh();}
   catch{setError("Unable to accept the invitation. Try again.");setPending(false);}
 }}>{pending&&<Loader2 data-icon="inline-start" className="animate-spin"/>}Join board</Button></div>;
}
