/**
 * JarvisLayout — Apple-minimal shell
 * Slim top bar, no sidebar, no HUD grid, no scanlines.
 * PIN-based auth gate (no Manus OAuth required).
 */
import { trpc } from "@/lib/trpc";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
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

// ── PIN Login Screen ──────────────────────────────────────────────────────────
function PinScreen({ onSuccess }: { onSuccess: () => void }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async (pin: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError(true);
        setDigits([]);
      }
    } catch {
      setError(true);
      setDigits([]);
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  const press = useCallback((d: string) => {
    if (loading) return;
    setError(false);
    setDigits(prev => {
      const next = [...prev, d];
      if (next.length === 4) {
        // Submit after short delay so last dot renders
        setTimeout(() => submit(next.join("")), 80);
      }
      return next.length <= 4 ? next : prev;
    });
  }, [loading, submit]);

  const del = useCallback(() => {
    if (loading) return;
    setError(false);
    setDigits(prev => prev.slice(0, -1));
  }, [loading]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      if (e.key === "Backspace") del();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [press, del]);

  const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-8 fade-in text-center max-w-xs w-full">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all duration-300 ${
            error ? "border-red-500/60 glow-red" : "border-primary/40 glow-teal"
          }`}>
            <div className={`w-4 h-4 rounded-full transition-colors duration-300 ${
              error ? "bg-red-500" : "bg-primary"
            } ${loading ? "animate-pulse" : ""}`} />
          </div>
          <p className="text-xl font-semibold tracking-tight text-foreground">Jarvis</p>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">
            {error ? "Falscher Code" : "PIN eingeben"}
          </p>
        </div>

        {/* Dot indicators */}
        <div className="flex gap-4">
          {[0,1,2,3].map(i => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border transition-all duration-150 ${
                error
                  ? "border-red-500 bg-red-500"
                  : digits.length > i
                    ? "border-primary bg-primary scale-110"
                    : "border-border bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
          {KEYS.map((k, idx) => {
            if (k === "") return <div key={idx} />;
            const isDelete = k === "⌫";
            return (
              <button
                key={idx}
                onClick={() => isDelete ? del() : press(k)}
                disabled={loading}
                className={`h-14 rounded-2xl text-base font-medium transition-all duration-150 active:scale-95 select-none
                  ${isDelete
                    ? "text-muted-foreground hover:text-foreground bg-transparent border border-border/40 hover:border-border"
                    : "bg-white/5 border border-border/30 text-foreground hover:bg-white/10 hover:border-border/60"
                  } disabled:opacity-40`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export function JarvisLayout({ children }: { children: ReactNode }) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const user = meQuery.data ?? null;
  const loading = meQuery.isLoading;
  const isAuthenticated = Boolean(user);

  const [location] = useLocation();
  const [connStatus, setConnStatus] = useState<Record<string, ConnStatus>>(
    Object.fromEntries(CONNECTORS.map(c => [c.key, "idle" as ConnStatus])),
  );
  // Clock uses a ref + direct DOM update to avoid re-rendering the entire layout tree every second
  const clockRef = useRef<HTMLSpanElement>(null);

  // Schedule setup — fires once when owner is authenticated
  trpc.jarvis.setupSchedule.useQuery(undefined, {
    enabled: !!(isAuthenticated && user?.role === "admin"),
    retry: false,
    staleTime: Infinity,
  });

  // Live clock — writes directly to the DOM span, zero React re-renders
  useEffect(() => {
    const tick = () => {
      if (clockRef.current) {
        clockRef.current.textContent = new Date().toLocaleTimeString("de-DE", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
      }
    };
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
    for (const key of Object.keys(h)) {
      const s = h[key]?.status;
      statusMap[key] = s === "ok" ? "online" : s === "missing_key" ? "idle" : "offline";
    }
    setConnStatus(statusMap);
  }, [healthQuery.data]);

  const logout = useCallback(async () => {
    await fetch("/api/pin-logout", { method: "POST", credentials: "include" });
    meQuery.refetch();
  }, [meQuery]);

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

  /* ── Not authenticated → PIN screen ─────────────────────────────────────── */
  if (!isAuthenticated) {
    return <PinScreen onSuccess={() => meQuery.refetch()} />;
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
          <span ref={clockRef} className="text-[11px] font-mono text-muted-foreground tabular-nums hidden sm:inline" />
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
