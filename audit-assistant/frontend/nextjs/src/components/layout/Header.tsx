"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import Link from "next/link";
import { UserMenu } from "./UserMenu";
import { Bell, Search } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 border-b border-border bg-white/80 dark:bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="h-full mx-auto max-w-screen-2xl px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Audit Assistant
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-sm">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                className="pl-8 pr-3 py-2 h-9 w-56 rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <button
            type="button"
            aria-label="Notifications"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
          >
            <Bell className="h-4 w-4" />
          </button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
