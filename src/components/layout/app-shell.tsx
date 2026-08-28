"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Header } from "./header";
import {
  Megaphone,
  Tag,
  List,
  Clock,
  CalendarDays,
  CalendarClock,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";

const NAV = [
  { href: "/campanhas",   label: "Campanhas",    icon: Megaphone },
  { href: "/ofertas",     label: "Ofertas",      icon: Tag },
  { href: "/publicacoes", label: "Publicações",  icon: List },
  { href: "/fila",        label: "Fila",         icon: Clock },
  { href: "/calendario",  label: "Calendário",   icon: CalendarDays },
  { href: "/agendamento", label: "Agendamento",  icon: CalendarClock },
];

const NAV_BOTTOM_MOBILE = [
  { href: "/campanhas", label: "Camp.",    icon: Megaphone },
  { href: "/ofertas",   label: "Ofertas",  icon: Tag },
  { href: "/fila",      label: "Fila",     icon: Clock },
  { href: "/dashboard", label: "Painel",   icon: LayoutDashboard },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Fecha drawer ao trocar de rota
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Bloqueia scroll do body quando drawer aberto
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="relative flex min-h-dvh bg-ambient">
      {/* Sidebar desktop (>= md) */}
      <SidebarDesktop pathname={pathname} />

      {/* Drawer mobile (< md) */}
      <DrawerMobile
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname}
      />

      {/* Coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-10 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Bottom nav mobile (< md) */}
      <BottomNavMobile pathname={pathname} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SidebarDesktop({ pathname }: { pathname: string }) {
  return (
    <aside
      className="hidden md:flex w-64 min-h-dvh flex-col sticky top-0 border-r border-orange-900/40"
      style={{
        background:
          "linear-gradient(180deg, #2b1207 0%, #1a0c05 70%, #150904 100%)",
      }}
    >
      <div className="px-5 py-6 border-b border-orange-900/30">
        <Logo />
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href} label={label} icon={Icon} pathname={pathname} />
        ))}
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-orange-900/30">
        <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} pathname={pathname} />
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DrawerMobile({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 z-50 w-72 h-dvh flex flex-col border-r border-orange-900/40 transition-transform will-change-transform",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background:
            "linear-gradient(180deg, #2b1207 0%, #1a0c05 70%, #150904 100%)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-orange-900/30">
          <Logo />
          <button
            onClick={onClose}
            className="p-2 text-orange-200/70 hover:text-white rounded-lg icon-only"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto scroll-thin">
          {NAV.map(({ href, label, icon: Icon }) => (
            <NavLink key={href} href={href} label={label} icon={Icon} pathname={pathname} />
          ))}
          <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} pathname={pathname} />
        </nav>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BottomNavMobile({ pathname }: { pathname: string }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl border-t border-orange-900/40"
      style={{
        background: "linear-gradient(0deg, rgba(15,9,6,0.98) 0%, rgba(26,12,5,0.95) 100%)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-stretch justify-around">
        {NAV_BOTTOM_MOBILE.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors icon-only",
                active ? "text-orange-400" : "text-orange-100/60"
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2 : 1.5} />
              <span className="text-[10px] font-medium tracking-tight">{label}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 h-[2px] w-8 rounded-b-full bg-orange-500 shadow-[0_0_8px_rgba(255,107,53,0.6)]"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 px-3.5 py-3 md:py-2.5 rounded-xl text-sm transition-all",
        active
          ? "bg-zinc-950 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_4px_16px_-6px_rgba(0,0,0,0.6)]"
          : "text-orange-100/70 hover:text-white hover:bg-black/30"
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] -ml-3.5 rounded-r-full bg-orange-500 shadow-[0_0_12px_rgba(255,107,53,0.7)]"
        />
      )}
      <Icon
        strokeWidth={1.5}
        className={cn(
          "w-[18px] h-[18px] shrink-0 transition-colors",
          active ? "text-orange-400" : "text-orange-200/60 group-hover:text-orange-300"
        )}
      />
      <span className="font-medium tracking-tight">{label}</span>
    </Link>
  );
}

export { Menu };
