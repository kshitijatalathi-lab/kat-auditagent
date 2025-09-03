"use client";
import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { OrgProvider } from "@/lib/org";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <OrgProvider>
          {children}
        </OrgProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
