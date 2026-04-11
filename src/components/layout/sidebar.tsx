"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Tag,
  List,
  Clock,
  Calendar,
  CalendarClock,
  LayoutDashboard,
} from "lucide-react";

const navItems = [
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/ofertas", label: "Ofertas", icon: Tag },
  { href: "/publicacoes", label: "Publicações", icon: List },
  { href: "/fila", label: "Fila", icon: Clock },
  { href: "/calendario", label: "Calendário", icon: Calendar },
  { href: "/agendamento", label: "Agendamento", icon: CalendarClock },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col border-r border-sidebar-border">
      <div className="px-6 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-sidebar-foreground">
          🎯 Buscador Geek
        </h1>
        <p className="text-xs text-sidebar-foreground/50 mt-0.5">Painel Admin</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            pathname.startsWith("/dashboard")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          Dashboard
        </Link>
      </div>
    </aside>
  );
}
