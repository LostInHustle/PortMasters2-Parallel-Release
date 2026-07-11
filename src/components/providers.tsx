"use client";

import { ThemeProvider } from "next-themes";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        {children}
        {/* Only direct action feedback (save confirmation, copy-code,
            restart errors) still goes through sonner; ambient event
            notifications (ledger, chat, DMs) have their own notification
            center now (see NotificationCenter.tsx). Bottom-right keeps
            even these rare toasts away from the center game board. */}
        <SonnerToaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
