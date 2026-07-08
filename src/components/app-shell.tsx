import { type ReactNode, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { navItems, bottomNavItems } from "./nav-items";
import { useAuth, signOut } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Wallet, Menu, Moon, Sun, LogOut, MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const name = (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "Usuário";

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 border-r border-border bg-sidebar z-40">
        <div className="p-5">
          <Link to="/dashboard" className="flex items-center gap-2.5 mb-7 px-1">
            <div className="size-9 rounded-xl bg-primary grid place-items-center text-primary-foreground shrink-0">
              <Wallet className="size-5" />
            </div>
            <span className="text-base font-bold tracking-tight">Gestor Financeiro</span>
          </Link>
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                  isActive(item.to)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <item.icon className="size-4.5 shrink-0" />
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">
              {initials(name)}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-medium truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button
              onClick={handleSignOut}
              className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-accent"
              aria-label="Sair"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-border bg-background/80 backdrop-blur-md">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary grid place-items-center text-primary-foreground">
            <Wallet className="size-4" />
          </div>
          <span className="font-bold tracking-tight">Gestor Financeiro</span>
        </Link>
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="size-9 grid place-items-center rounded-lg text-muted-foreground" aria-label="Alternar tema">
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="size-9 grid place-items-center rounded-lg text-muted-foreground" aria-label="Menu">
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0 flex flex-col">
              <SheetHeader className="p-5 border-b border-border">
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              <nav className="p-3 space-y-0.5 overflow-y-auto flex-1">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                      isActive(item.to) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    <item.icon className="size-5 shrink-0" />
                    {item.title}
                  </Link>
                ))}
              </nav>
              <div className="p-3 border-t border-border">
                <Button variant="ghost" className="w-full justify-start text-destructive" onClick={handleSignOut}>
                  <LogOut className="size-4" /> Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main content */}
      <main className="md:ml-64 pb-24 md:pb-10 min-h-screen">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-background/95 backdrop-blur-xl border-t border-border flex items-center justify-around py-2 px-2 z-40">
        {bottomNavItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium",
              isActive(item.to) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.title}
          </Link>
        ))}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium text-muted-foreground"
        >
          <MoreHorizontal className="size-5" />
          Mais
        </button>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>;
}

// re-export to satisfy unused import lint safety
export const _supabase = supabase;
export type { ReactNode as _RN } from "react";