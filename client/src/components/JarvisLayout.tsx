import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Activity, Brain, Cpu, Database, KeyRound, LogOut, Mic, ShieldCheck, Wrench } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { path: "/", label: "Command", icon: Mic },
  { path: "/conversations", label: "Transcripts", icon: Brain },
  { path: "/context", label: "Business Core", icon: Database },
  { path: "/vault", label: "Vault", icon: KeyRound },
  { path: "/tasks", label: "Tasks", icon: Wrench },
];

export function JarvisLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const setupSchedule = trpc.jarvis.setupSchedule.useMutation();

  // Register morning briefing cron on first authenticated load
  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      setupSchedule.mutate();
    }
  }, [isAuthenticated, user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-display tracking-[0.4em] text-sm text-primary glow-text-cyan flicker">
          INITIALIZING JARVIS...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="hud-panel hud-corner p-10 max-w-md w-full flex flex-col items-center gap-6">
          <Cpu className="h-10 w-10 text-primary glow-text-cyan" />
          <div className="text-center space-y-2">
            <h1 className="font-display text-2xl glow-text-cyan">JARVIS</h1>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">
              Velur Command Center
            </p>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Authentication required. This interface is restricted to the registered owner.
          </p>
          <Button
            onClick={() => (window.location.href = getLoginUrl())}
            size="lg"
            className="w-full font-display tracking-[0.3em]"
          >
            Authenticate
          </Button>
        </div>
      </div>
    );
  }

  if (user && user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="hud-panel hud-corner p-10 max-w-md w-full flex flex-col items-center gap-6">
          <ShieldCheck className="h-10 w-10 text-destructive" />
          <div className="text-center space-y-2">
            <h1 className="font-display text-2xl text-destructive">ACCESS DENIED</h1>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">
              Owner Authorization Required
            </p>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Jarvis is a private command interface for the Velur owner. Your account does not have access.
          </p>
          <Button onClick={logout} variant="outline" className="font-display tracking-[0.3em]">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-primary/20 bg-background/40 backdrop-blur sticky top-0 z-30">
        <div className="px-6 py-3 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-9 w-9 rounded-full border border-primary/60 flex items-center justify-center">
              <div className="absolute inset-1 rounded-full bg-primary/20 blur-sm" />
              <Cpu className="h-4 w-4 text-primary relative" />
            </div>
            <div className="leading-tight">
              <div className="font-display tracking-[0.3em] text-sm glow-text-cyan">JARVIS</div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                Velur · v1.0
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-6">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md font-display tracking-[0.25em] text-[11px] uppercase transition-colors ${
                    active
                      ? "bg-primary/15 text-primary border border-primary/40"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Owner Locked</span>
              <span className="mx-2 text-primary/40">|</span>
              <Activity className="h-3.5 w-3.5 text-accent" />
              <span>{user?.name ?? user?.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-primary"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">{children}</main>

      <footer className="px-6 py-2 border-t border-primary/20 text-[10px] tracking-[0.3em] uppercase text-muted-foreground flex items-center justify-between">
        <span>JARVIS · Local time {new Date().toLocaleTimeString()}</span>
        <span>velur.de · command interface</span>
      </footer>
    </div>
  );
}
