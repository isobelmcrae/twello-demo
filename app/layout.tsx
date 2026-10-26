import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
export const metadata:Metadata={title:{default:"Twello",template:"%s · Twello"},description:"Shared boards, sticky notes, and a little more done.",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><TooltipProvider>{children}</TooltipProvider><Toaster richColors closeButton/></body></html>}
