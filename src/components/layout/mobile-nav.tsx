"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";

interface MobileNavProps {
  /** Account area rendered at the bottom of the sheet (server-rendered user menu). */
  footer: ReactNode;
}

export function MobileNav({ footer }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="text-left text-lg font-extrabold">
            JobPilot<span className="text-brand-text">AI</span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <div className="border-t p-2">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}
