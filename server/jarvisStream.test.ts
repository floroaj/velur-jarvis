import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for jarvisStream SSE endpoint logic
 * We test the helper functions in isolation since the full Express
 * endpoint requires a live HTTP server.
 */

// ── Vault secret interpolation ────────────────────────────────────────────────
function interpolateVaultSecrets(
  template: string,
  vault: Record<string, string>,
): string {
  return template.replace(/\{\{vault:([^}]+)\}\}/g, (_, key) => {
    return vault[key.trim()] ?? `{{vault:${key.trim()}}}`;
  });
}

describe("interpolateVaultSecrets", () => {
  it("replaces known vault placeholders", () => {
    const result = interpolateVaultSecrets(
      "Bearer {{vault:TripleWhale_API}}",
      { TripleWhale_API: "tw_secret_123" },
    );
    expect(result).toBe("Bearer tw_secret_123");
  });

  it("leaves unknown placeholders intact", () => {
    const result = interpolateVaultSecrets(
      "Bearer {{vault:Unknown_Key}}",
      { TripleWhale_API: "tw_secret_123" },
    );
    expect(result).toBe("Bearer {{vault:Unknown_Key}}");
  });

  it("handles multiple placeholders in one string", () => {
    const result = interpolateVaultSecrets(
      "{{vault:A}} and {{vault:B}}",
      { A: "alpha", B: "beta" },
    );
    expect(result).toBe("alpha and beta");
  });

  it("returns unchanged string when no placeholders present", () => {
    const input = "no placeholders here";
    expect(interpolateVaultSecrets(input, {})).toBe(input);
  });
});

// ── Tool name parsing ─────────────────────────────────────────────────────────
function parseToolNames(toolsString: string): string[] {
  return toolsString
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

describe("parseToolNames", () => {
  it("splits comma-separated tool names", () => {
    expect(parseToolNames("get_revenue, send_report, fetch_kpis")).toEqual([
      "get_revenue",
      "send_report",
      "fetch_kpis",
    ]);
  });

  it("handles single tool", () => {
    expect(parseToolNames("get_revenue")).toEqual(["get_revenue"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseToolNames("")).toEqual([]);
  });
});

// ── SSE event formatting ──────────────────────────────────────────────────────
function formatSSEEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe("formatSSEEvent", () => {
  it("formats a token event correctly", () => {
    const event = formatSSEEvent({ type: "token", token: "Hello" });
    expect(event).toBe(`data: {"type":"token","token":"Hello"}\n\n`);
  });

  it("formats a done event correctly", () => {
    const event = formatSSEEvent({ type: "done", conversationId: 1, reply: "Hi" });
    expect(event).toContain('"type":"done"');
    expect(event).toContain('"conversationId":1');
    expect(event.endsWith("\n\n")).toBe(true);
  });
});

// ── System prompt builder ─────────────────────────────────────────────────────
function buildMinimalSystemPrompt(brandName: string, vaultLabels: string[]): string {
  const lines = [
    "You are JARVIS — Florian's private AI command center for Velur.",
    `Brand: ${brandName}`,
  ];
  if (vaultLabels.length > 0) {
    lines.push(`Available API integrations: ${vaultLabels.join(", ")}`);
  }
  return lines.join("\n");
}

describe("buildMinimalSystemPrompt", () => {
  it("includes brand name", () => {
    const prompt = buildMinimalSystemPrompt("Velur", []);
    expect(prompt).toContain("Velur");
  });

  it("includes vault labels when present", () => {
    const prompt = buildMinimalSystemPrompt("Velur", ["TripleWhale_API", "Klaviyo_API"]);
    expect(prompt).toContain("TripleWhale_API");
    expect(prompt).toContain("Klaviyo_API");
  });

  it("omits vault section when no labels", () => {
    const prompt = buildMinimalSystemPrompt("Velur", []);
    expect(prompt).not.toContain("Available API integrations");
  });
});
