"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LayoutDashboard, FileUp, FileText, Users, ListChecks, Activity, Wand2 } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const mainNav = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Audit Wizard", href: "/wizard", icon: Wand2 },
    { title: "Document Upload", href: "/upload", icon: FileUp },
    { title: "Audit Checklists", href: "/checklists", icon: ListChecks },
    { title: "Active Sessions", href: "/audit/demo", icon: Activity },
    { title: "Reports", href: "/report", icon: FileText },
  ];

  function onReportClick(e: React.MouseEvent<HTMLAnchorElement>) {
    try {
      const lr = typeof window !== 'undefined' ? localStorage.getItem('lastReportUrl') : null;
      if (lr) {
        e.preventDefault();
        router.push(lr);
      }
    } catch {
      // ignore localStorage access issues
    }
  }

  const adminNav = [
    { title: "Admin", href: "/admin", icon: Users },
  ];

  return (
    <>
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold tracking-tight">Audit Assistant</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href} onClick={item.title === 'Reports' ? onReportClick : undefined}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </>
  );
}
