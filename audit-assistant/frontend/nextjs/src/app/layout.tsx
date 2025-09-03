import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Audit Assistant",
  description: "AI-powered compliance auditing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <SidebarProvider>
            <div className="min-h-svh flex w-full bg-background">
              <Sidebar collapsible="icon">
                <AppSidebar />
              </Sidebar>
              <SidebarInset>
                <Header />
                <Toaster richColors position="top-right" />
                <div className="mx-auto max-w-screen-2xl w-full">
                  {children}
                </div>
              </SidebarInset>
            </div>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
