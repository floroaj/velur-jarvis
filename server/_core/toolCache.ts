/**
 * In-memory tool-result cache for Jarvis.
 * Key = sha256(toolName + JSON.stringify(args))
 * TTL is configurable per tool. Non-cacheable tools bypass the cache entirely.
 */
import { createHash } from "crypto";

// Per-tool TTL in milliseconds. 0 = never cache.
const TOOL_TTL: Record<string, number> = {
  get_triple_whale_summary: 5 * 60 * 1000,   // 5 min
  get_klaviyo_summary:      5 * 60 * 1000,   // 5 min
  get_clarity_summary:      5 * 60 * 1000,   // 5 min
  get_meta_ads_summary:     5 * 60 * 1000,   // 5 min
  get_woocommerce_summary:  5 * 60 * 1000,   // 5 min
  get_woocommerce_orders:   5 * 60 * 1000,   // 5 min
  get_woocommerce_products: 5 * 60 * 1000,   // 5 min
  get_woocommerce_customers:5 * 60 * 1000,   // 5 min
  list_tasks:               60 * 1000,        // 60 sec
  // Explicitly NOT cached (side-effects):
  // run_task, create_wordpress_post, upload_wordpress_media, update_woocommerce_product_stock
};

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function cacheKey(toolName: string, args: Record<string, unknown>): string {
  const raw = toolName + JSON.stringify(args);
  return createHash("sha256").update(raw).digest("hex");
}

export function cacheGet(toolName: string, args: Record<string, unknown>): string | null {
  const ttl = TOOL_TTL[toolName];
  if (!ttl) return null; // Not cacheable

  const key = cacheKey(toolName, args);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(toolName: string, args: Record<string, unknown>, value: string): void {
  const ttl = TOOL_TTL[toolName];
  if (!ttl) return; // Not cacheable

  const key = cacheKey(toolName, args);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

/** Wrap an async tool executor with cache lookup/store. */
export async function withCache(
  toolName: string,
  args: Record<string, unknown>,
  executor: () => Promise<string>,
): Promise<string> {
  const cached = cacheGet(toolName, args);
  if (cached !== null) return cached;

  const result = await executor();
  cacheSet(toolName, args, result);
  return result;
}

/** For testing: clear all cache entries. */
export function cacheClear(): void {
  cache.clear();
}

/** For testing: inspect cache size. */
export function cacheSize(): number {
  return cache.size;
}
