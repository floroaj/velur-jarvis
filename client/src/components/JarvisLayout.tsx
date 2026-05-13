/**
 * JarvisLayout — Apple-minimal shell
 * Slim top bar, no sidebar, no HUD grid, no scanlines.
 * Owner-only gate enforced on both client and server.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const NAV_ITEMS = [
  { href: "/",              label: "Command"    },
  { href: "/conversations", label: "Transcripts"},
  { href: "/context",       label: "Core"       },
  { href: "/vault",         label: "Vault"      },
  { href: "/tasks",         label: "Tasks"      },
];

const CONNECTORS = [
  { key: "tw",   label: "TW"  },
  { key: "kl",   label: "KV"  },
  { key: "cl",   label: "CL"  },
  { key: "meta", label: "META"},
  { key: "wp",   label: "WP"  },
];

type ConnStatus = "online" | "offline" | "idle";

export function JarvisLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();
  const [connStatus, setConnStatus] = useState<Record<string, ConnStatus>>(
    Object.fromEntries(CONNECTORS.map(c => [c.key, "idle" as ConnStatus])),
  );
  const [connTooltip, setConnTooltip] = useState<Record<string, string>>({});
  const [clock, setClock] = useState("");

  // Schedule setup — fires once when owner is authenticated
  trpc.jarvis.setupSchedule.useQuery(undefined, {
    enabled: !!(isAuthenticated && user?.role === "admin"),
    retry: false,
    staleTime: Infinity,
  });

  // Live clock
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Real connector health via tRPC — refreshes every 30s
  const healthQuery = trpc.jarvis.connectorHealth.useQuery(undefined, {
    enabled: !!(isAuthenticated && user?.role === "admin"),
    refetchInterval: 30_000,
    retry: false,
    staleTime: 25_000,
  });

  useEffect(() => {
    if (!healthQuery.data) return;
    const h = healthQuery.data as unknown as Record<string, { status: string; message: string }>;
    const statusMap: Record<string, ConnStatus> = {};
    const tooltipMap: Record<string, string> = {};
    for (const key of Object.keys(h)) {
      const s = h[key]?.status;
      statusMap[key] = s === "ok" ? "online" : s === "missing_key" ? "idle" : "offline";
      tooltipMap[key] = h[key]?.message ?? "";
    }
    setConnStatus(statusMap);
    setConnTooltip(tooltipMap);
  }, [healthQuery.data]);

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 fade-in">
          <div className="w-10 h-10 rounded-full border border-primary/40 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
          </div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">Initializing</p>
        </div>
      </div>
    );
  }

  /* ── Not authenticated ───────────────────────────────────────────────────── */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-8 fade-in text-center max-w-sm">
          <div className="w-16 h-16 rounded-full border border-primary/30 flex items-center justify-center glow-teal">
            <div className="w-5 h-5 rounded-full bg-primary" />
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight text-foreground mb-2">Jarvis</p>
            <p className="text-sm text-muted-foreground">
              Private AI command center for Velur. Authentication required.
            </p>
          </div>
          <button
            onClick={() => (window.location.href = getLoginUrl())}
            className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity btn-press"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  /* ── Not owner ───────────────────────────────────────────────────────────── */
  if (user && user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-6 fade-in text-center max-w-sm">
          <div className="w-14 h-14 rounded-full border border-destructive/40 flex items-center justify-center">
            <span className="text-destructive text-2xl">⊘</span>
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground mb-1">Access Restricted</p>
            <p className="text-sm text-muted-foreground">
              Jarvis is a private system. Only the owner can access this interface.
            </p>
          </div>
          <button
            onClick={logout}
            className="px-5 py-2 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground transition-colors btn-press"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  /* ── Dot color ───────────────────────────────────────────────────────────── */
  const dotCls: Record<ConnStatus, string> = {
    online:  "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]",
    offline: "bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.8)]",
    idle:    "bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.7)]",
  };

  /* ── Layout ──────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-50 h-12 border-b border-border/40 bg-background/85 backdrop-blur-2xl flex items-center px-5 gap-5">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-6 h-6 rounded-full border border-primary/50 flex items-center justify-center transition-all group-hover:border-primary">
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Jarvis</span>
          <span className="text-xs text-muted-foreground font-light hidden sm:inline">/ Velur</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-0.5 flex-1">
          {NAV_ITEMS.map(item => {
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer select-none ${
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Connector dots */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {CONNECTORS.map(c => (
            <div key={c.key} className="flex items-center gap-1.5" title={c.label}>
              <div className={`w-1.5 h-1.5 rounded-full ${dotCls[connStatus[c.key] ?? "idle"]}`} />
              <span className="text-[10px] font-mono text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>

        {/* Clock + avatar */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums hidden sm:inline">
            {clock}
          </span>
          <button
            onClick={logout}
            className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center hover:border-primary/50 transition-colors btn-press"
            title="Sign out"
          >
            <span className="text-[11px] font-medium">
              {user?.name?.charAt(0)?.toUpperCase() ?? "F"}
            </span>
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
