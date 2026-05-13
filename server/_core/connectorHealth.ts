/**
 * Connector Health Checks
 * Each ping function makes a cheap GET request with a 4s timeout.
 * Results are cached for 30 seconds via toolCache.
 */
import { getApiKeyByLabel } from "../db";
import { decryptSecret } from "./crypto";

// Simple in-memory cache for health check results (separate from toolCache)
const healthCache = new Map<string, { value: ConnectorHealth; expiresAt: number }>();

function healthCacheGet(key: string): ConnectorHealth | null {
  const entry = healthCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { healthCache.delete(key); return null; }
  return entry.value;
}

function healthCacheSet(key: string, value: ConnectorHealth, ttlMs: number): void {
  healthCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export type HealthStatus = "ok" | "error" | "missing_key" | "timeout";

export interface ConnectorHealth {
  status: HealthStatus;
  message: string;
  latencyMs: number;
  httpStatus?: number;
  lastChecked: number; // UTC ms
}

const HEALTH_CACHE_TTL_MS = 30_000;
const PING_TIMEOUT_MS = 4_000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(name: string, userId: number) {
  return `health:${name}:${userId}`;
}

// ── Triple Whale ─────────────────────────────────────────────────────────────
export async function pingTripleWhale(userId: number): Promise<ConnectorHealth> {
  const key = cacheKey("triple_whale", userId);
  const cached = healthCacheGet(key);
  if (cached) return cached;

  const now = Date.now();
  let result: ConnectorHealth;

  try {
    const row = await getApiKeyByLabel("TripleWhale_API", userId);
    const apiKey = row ? decryptSecret(row.cipherText) : (process.env.TripleWhale_API ?? "");
    if (!apiKey) {
      result = { status: "missing_key", message: "TripleWhale_API nicht im Vault — bitte unter /vault hinterlegen.", latencyMs: 0, lastChecked: now };
    } else {
      const t0 = Date.now();
      const resp = await fetchWithTimeout("https://api.triplewhale.com/api/v2/tw-public/get-summary-data-daily", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ shopDomain: "", startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10) }),
      });
      const latencyMs = Date.now() - t0;
      if (resp.status === 401 || resp.status === 403) {
        result = { status: "error", message: `Triple Whale: Ungültiger API-Key (${resp.status})`, latencyMs, httpStatus: resp.status, lastChecked: now };
      } else if (resp.status >= 500) {
        result = { status: "error", message: `Triple Whale: Server-Fehler (${resp.status})`, latencyMs, httpStatus: resp.status, lastChecked: now };
      } else {
        result = { status: "ok", message: "Triple Whale verbunden", latencyMs, httpStatus: resp.status, lastChecked: now };
      }
    }
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    result = { status: isTimeout ? "timeout" : "error", message: isTimeout ? "Triple Whale: Timeout (>4s)" : `Triple Whale: ${String(e)}`, latencyMs: PING_TIMEOUT_MS, lastChecked: now };
  }

  healthCacheSet(key, result, HEALTH_CACHE_TTL_MS);
  return result;
}

// ── Klaviyo ──────────────────────────────────────────────────────────────────
export async function pingKlaviyo(userId: number): Promise<ConnectorHealth> {
  const key = cacheKey("klaviyo", userId);
  const cached = healthCacheGet(key);
  if (cached) return cached;

  const now = Date.now();
  let result: ConnectorHealth;

  try {
    const row = await getApiKeyByLabel("Klaviyo_API", userId);
    const apiKey = row ? decryptSecret(row.cipherText) : (process.env.Klaviyo_API ?? "");
    if (!apiKey) {
      result = { status: "missing_key", message: "Klaviyo_API nicht im Vault — bitte unter /vault hinterlegen.", latencyMs: 0, lastChecked: now };
    } else {
      const t0 = Date.now();
      const resp = await fetchWithTimeout("https://a.klaviyo.com/api/accounts/", {
        headers: { Authorization: `Klaviyo-API-Key ${apiKey}`, revision: "2024-02-15", accept: "application/json" },
      });
      const latencyMs = Date.now() - t0;
      if (resp.status === 401 || resp.status === 403) {
        result = { status: "error", message: `Klaviyo: Ungültiger API-Key (${resp.status})`, latencyMs, httpStatus: resp.status, lastChecked: now };
      } else if (resp.ok) {
        result = { status: "ok", message: "Klaviyo verbunden", latencyMs, httpStatus: resp.status, lastChecked: now };
      } else {
        result = { status: "error", message: `Klaviyo: HTTP ${resp.status}`, latencyMs, httpStatus: resp.status, lastChecked: now };
      }
    }
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    result = { status: isTimeout ? "timeout" : "error", message: isTimeout ? "Klaviyo: Timeout (>4s)" : `Klaviyo: ${String(e)}`, latencyMs: PING_TIMEOUT_MS, lastChecked: now };
  }

  healthCacheSet(key, result, HEALTH_CACHE_TTL_MS);
  return result;
}

// ── Clarity ──────────────────────────────────────────────────────────────────
export async function pingClarity(userId: number): Promise<ConnectorHealth> {
  const key = cacheKey("clarity", userId);
  const cached = healthCacheGet(key);
  if (cached) return cached;

  const now = Date.now();
  let result: ConnectorHealth;

  try {
    const row = await getApiKeyByLabel("ClarityAPI", userId);
    const apiKey = row ? decryptSecret(row.cipherText) : (process.env.ClarityAPI ?? "");
    if (!apiKey) {
      result = { status: "missing_key", message: "ClarityAPI nicht im Vault — bitte unter /vault hinterlegen.", latencyMs: 0, lastChecked: now };
    } else {
      const t0 = Date.now();
      const resp = await fetchWithTimeout("https://www.clarity.ms/api/v1/projects", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const latencyMs = Date.now() - t0;
      if (resp.status === 401 || resp.status === 403) {
        result = { status: "error", message: `Clarity: Ungültiger API-Key (${resp.status})`, latencyMs, httpStatus: resp.status, lastChecked: now };
      } else if (resp.ok) {
        result = { status: "ok", message: "Clarity verbunden", latencyMs, httpStatus: resp.status, lastChecked: now };
      } else {
        result = { status: "error", message: `Clarity: HTTP ${resp.status}`, latencyMs, httpStatus: resp.status, lastChecked: now };
      }
    }
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    result = { status: isTimeout ? "timeout" : "error", message: isTimeout ? "Clarity: Timeout (>4s)" : `Clarity: ${String(e)}`, latencyMs: PING_TIMEOUT_MS, lastChecked: now };
  }

  healthCacheSet(key, result, HEALTH_CACHE_TTL_MS);
  return result;
}

// ── Meta Ads ─────────────────────────────────────────────────────────────────
export async function pingMetaAds(): Promise<ConnectorHealth> {
  const key = "health:meta:0";
  const cached = healthCacheGet(key);
  if (cached) return cached;

  const now = Date.now();
  let result: ConnectorHealth;

  try {
    const t0 = Date.now();
    // Use the MCP CLI to check if Meta Ads is accessible
    const { execSync } = await import("child_process");
    execSync("manus-mcp-cli tool list --server meta-marketing", { timeout: 4000, stdio: "pipe" });
    const latencyMs = Date.now() - t0;
    result = { status: "ok", message: "Meta Ads MCP verbunden", latencyMs, lastChecked: now };
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && (e.message.includes("ETIMEDOUT") || e.message.includes("timeout"));
    result = { status: isTimeout ? "timeout" : "error", message: isTimeout ? "Meta Ads: Timeout (>4s)" : "Meta Ads: MCP nicht erreichbar", latencyMs: PING_TIMEOUT_MS, lastChecked: now };
  }

  healthCacheSet(key, result, HEALTH_CACHE_TTL_MS);
  return result;
}

// ── WordPress ────────────────────────────────────────────────────────────────
export async function pingWordPress(userId: number): Promise<ConnectorHealth> {
  const key = cacheKey("wordpress", userId);
  const cached = healthCacheGet(key);
  if (cached) return cached;

  const now = Date.now();
  let result: ConnectorHealth;

  try {
    // Build auth from vault or env
    let auth = "";
    const [userRow, passRow] = await Promise.all([
      getApiKeyByLabel("WordPress_User", userId),
      getApiKeyByLabel("WordPress_AppPassword", userId),
    ]);
    if (userRow && passRow) {
      const wpUser = decryptSecret(userRow.cipherText);
      const wpPass = decryptSecret(passRow.cipherText);
      auth = "Basic " + Buffer.from(`${wpUser}:${wpPass}`).toString("base64");
    } else {
      const appPass = process.env.WORDPRESS_APP_PASSWORD ?? "";
      if (appPass && appPass.includes(":")) {
        auth = "Basic " + Buffer.from(appPass).toString("base64");
      }
    }

    if (!auth) {
      result = { status: "missing_key", message: "WordPress-Credentials fehlen — bitte WordPress_User + WordPress_AppPassword im Vault hinterlegen.", latencyMs: 0, lastChecked: now };
    } else {
      const wpBase = process.env.WORDPRESS_URL ?? "https://velur.de";
      const t0 = Date.now();
      const resp = await fetchWithTimeout(`${wpBase}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: auth },
      });
      const latencyMs = Date.now() - t0;
      if (resp.status === 401 || resp.status === 403) {
        result = { status: "error", message: `WordPress: Ungültige Credentials (${resp.status})`, latencyMs, httpStatus: resp.status, lastChecked: now };
      } else if (resp.ok) {
        result = { status: "ok", message: "WordPress verbunden", latencyMs, httpStatus: resp.status, lastChecked: now };
      } else {
        result = { status: "error", message: `WordPress: HTTP ${resp.status}`, latencyMs, httpStatus: resp.status, lastChecked: now };
      }
    }
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    result = { status: isTimeout ? "timeout" : "error", message: isTimeout ? "WordPress: Timeout (>4s)" : `WordPress: ${String(e)}`, latencyMs: PING_TIMEOUT_MS, lastChecked: now };
  }

  healthCacheSet(key, result, HEALTH_CACHE_TTL_MS);
  return result;
}

// ── All connectors ────────────────────────────────────────────────────────────
export interface AllConnectorHealth {
  tw: ConnectorHealth;
  kl: ConnectorHealth;
  cl: ConnectorHealth;
  meta: ConnectorHealth;
  wp: ConnectorHealth;
}

export async function pingAllConnectors(userId: number): Promise<AllConnectorHealth> {
  const [tw, kl, cl, meta, wp] = await Promise.all([
    pingTripleWhale(userId),
    pingKlaviyo(userId),
    pingClarity(userId),
    pingMetaAds(),
    pingWordPress(userId),
  ]);
  return { tw, kl, cl, meta, wp };
}

export function formatHealthForSystemPrompt(health: AllConnectorHealth | null | undefined): string {
  if (!health) return "";
  const fmt = (name: string, h: ConnectorHealth) => {
    const icon = h.status === "ok" ? "✅" : h.status === "missing_key" ? "⚪" : h.status === "timeout" ? "⏱" : "❌";
    return `- ${icon} ${name}: ${h.message}${h.latencyMs > 0 ? ` (${h.latencyMs}ms)` : ""}`;
  };
  return [
    "## Connector Status (live)",
    fmt("Triple Whale", health.tw),
    fmt("Klaviyo", health.kl),
    fmt("Clarity", health.cl),
    fmt("Meta Ads", health.meta),
    fmt("WordPress", health.wp),
  ].join("\n");
}
