/**
 * Tests for connectorHealth.ts and historySummarizer.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── connectorHealth ────────────────────────────────────────────────────────────

describe("connectorHealth — formatHealthForSystemPrompt", () => {
  const makeHealth = (overrides: Partial<Record<string, { status: string; message: string; latencyMs: number }>>) => ({
    tw:   { status: "ok",          message: "Triple Whale: connected",    latencyMs: 120 },
    kl:   { status: "ok",          message: "Klaviyo: connected",          latencyMs: 95  },
    cl:   { status: "missing_key", message: "Clarity: API key not set",   latencyMs: 0   },
    meta: { status: "ok",          message: "Meta Ads: connected",         latencyMs: 200 },
    wp:   { status: "ok",          message: "WordPress: connected",        latencyMs: 80  },
    ...overrides,
  });

  it("formats all-online health as a clean section", async () => {
    const { formatHealthForSystemPrompt } = await import("./_core/connectorHealth");
    const result = formatHealthForSystemPrompt(makeHealth({}) as any);
    expect(result).toContain("## Connector Status");
    expect(result).toContain("Triple Whale");
    expect(result).toContain("Klaviyo");
    expect(result).toContain("Clarity: API key not set");
  });

  it("returns empty string for null/undefined input", async () => {
    const { formatHealthForSystemPrompt } = await import("./_core/connectorHealth");
    expect(formatHealthForSystemPrompt(null as any)).toBe("");
    expect(formatHealthForSystemPrompt(undefined as any)).toBe("");
  });

  it("marks offline connectors with error status", async () => {
    const { formatHealthForSystemPrompt } = await import("./_core/connectorHealth");
    const health = makeHealth({
      tw: { status: "error", message: "Triple Whale: HTTP 401 Unauthorized", latencyMs: 0 },
    });
    const result = formatHealthForSystemPrompt(health as any);
    expect(result).toContain("401");
    expect(result).toContain("Triple Whale");
  });
});

// ── historySummarizer ──────────────────────────────────────────────────────────

describe("historySummarizer — getHistoryForLLM", () => {
  it("returns messages as-is when count <= 20", async () => {
    // Mock getDb to return null (no DB in test environment)
    vi.mock("../server/db", () => ({ getDb: async () => null }));

    const { getHistoryForLLM } = await import("./_core/historySummarizer");
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i + 1}`,
    }));

    const result = await getHistoryForLLM(1, msgs);
    expect(result.summarized).toBe(false);
    expect(result.llmMessages).toHaveLength(10);
    expect(result.llmMessages[0]?.role).toBe("user");
  });

  it("filters out system messages from history", async () => {
    const { getHistoryForLLM } = await import("./_core/historySummarizer");
    const msgs = [
      { id: 1, role: "system",    content: "System prompt" },
      { id: 2, role: "user",      content: "Hello" },
      { id: 3, role: "assistant", content: "Hi there" },
    ];

    const result = await getHistoryForLLM(99, msgs);
    expect(result.summarized).toBe(false);
    // system message filtered out
    expect(result.llmMessages.every(m => m.role !== "system")).toBe(true);
    expect(result.llmMessages).toHaveLength(2);
  });

  it("falls back to last 20 messages when DB unavailable and history > 20", async () => {
    const { getHistoryForLLM } = await import("./_core/historySummarizer");
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i + 1}`,
    }));

    // DB is null (mocked above), so falls back to last 20
    const result = await getHistoryForLLM(1, msgs);
    // summarized = false because DB unavailable
    expect(result.summarized).toBe(false);
    // Should return at most 20 messages as fallback
    expect(result.llmMessages.length).toBeLessThanOrEqual(20);
  });
});
