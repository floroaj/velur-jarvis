/**
 * Jarvis Streaming Chat SSE endpoint
 * POST /api/jarvis/stream
 * Accepts: { conversationId?, text, tools?: boolean }
 * Streams: SSE events { type: "token"|"tool_call"|"tool_result"|"done"|"error", ... }
 */
import type { Application } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { invokeLLM, type Message, type Tool } from "./_core/llm";
import {
  appendMessage,
  createConversation,
  getBusinessContext,
  getConversation,
  listApiKeys,
  listMessages,
  listTasks,
  recordTaskRun,
  getApiKeyByLabel,
} from "./db";
import { decryptSecret } from "./_core/crypto";
import { generateSpeech } from "./_core/tts";
import { notifyOwner } from "./_core/notification";

// ── Tool definitions exposed to the LLM ──────────────────────────────────────

const JARVIS_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_triple_whale_summary",
      description: "Get the latest Triple Whale performance summary for velur.de including revenue, ROAS, CAC, orders, and top products for a given date range.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of past days to summarize (default 7)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_klaviyo_summary",
      description: "Get Klaviyo email marketing performance: revenue, open rates, click rates, top flows, and recent campaign stats.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of past days (default 7)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clarity_summary",
      description: "Get Microsoft Clarity website analytics: sessions, engagement score, rage clicks, dead clicks, and scroll depth for velur.de.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of past days (default 7)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meta_ads_summary",
      description: "Get Meta Ads performance for Velur: spend, ROAS, impressions, clicks, CPM, CPC, and campaign status.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of past days (default 7)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List all configured Jarvis automation tasks that can be triggered.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_task",
      description: "Execute a configured Jarvis automation task by name. Use list_tasks first to confirm the task exists.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact name of the task to run" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_wordpress_post",
      description: "Create a draft or published post on velur.de WordPress. Returns the post URL.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string", description: "HTML content of the post" },
          status: { type: "string", enum: ["draft", "publish"], description: "Post status" },
          categories: { type: "array", items: { type: "number" }, description: "Category IDs" },
        },
        required: ["title", "content"],
        additionalProperties: false,
      },
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  userId: number,
): Promise<string> {
  try {
    switch (toolName) {
      case "get_triple_whale_summary":
        return await fetchTripleWhaleSummary(args.days as number | undefined, userId);
      case "get_klaviyo_summary":
        return await fetchKlaviyoSummary(args.days as number | undefined, userId);
      case "get_clarity_summary":
        return await fetchClaritySummary(args.days as number | undefined, userId);
      case "get_meta_ads_summary":
        return await fetchMetaAdsSummary(args.days as number | undefined);
      case "list_tasks":
        return await listTasksTool(userId);
      case "run_task":
        return await runTaskTool(args.name as string, userId);
      case "create_wordpress_post":
        return await createWordPressPost(
          args.title as string,
          args.content as string,
          (args.status as string) ?? "draft",
          (args.categories as number[]) ?? [],
        );
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Error executing ${toolName}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function fetchTripleWhaleSummary(days = 7, userId: number): Promise<string> {
  const apiKeyRow = await getApiKeyByLabel("TripleWhale_API", userId);
  const apiKey = apiKeyRow ? decryptSecret(apiKeyRow.cipherText) : process.env.TripleWhale_API ?? "";
  if (!apiKey) return "Triple Whale API key not configured in vault.";

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const resp = await fetch(
    `https://api.triplewhale.com/api/v2/tw-attribution/get-orders-with-journeys?shop-id=velur.de&start=${fmt(startDate)}&end=${fmt(endDate)}`,
    { headers: { "x-api-key": apiKey, "Content-Type": "application/json" } },
  );
  if (!resp.ok) {
    // Fallback: summary endpoint
    const resp2 = await fetch(
      `https://api.triplewhale.com/api/v2/attribution/summary?shop-id=velur.de&startDate=${fmt(startDate)}&endDate=${fmt(endDate)}`,
      { headers: { "x-api-key": apiKey } },
    );
    if (!resp2.ok) return `Triple Whale API error: ${resp2.status}`;
    const data = await resp2.json();
    return JSON.stringify(data, null, 2).slice(0, 2000);
  }
  const data = await resp.json();
  return JSON.stringify(data, null, 2).slice(0, 2000);
}

async function fetchKlaviyoSummary(days = 7, userId: number): Promise<string> {
  const apiKeyRow = await getApiKeyByLabel("Klaviyo_API", userId);
  const apiKey = apiKeyRow ? decryptSecret(apiKeyRow.cipherText) : process.env.Klaviyo_API ?? "";
  if (!apiKey) return "Klaviyo API key not configured in vault.";

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString();

  const resp = await fetch(
    `https://a.klaviyo.com/api/metrics/?filter=and(greater-or-equal(datetime,${fmt(startDate)}),less-or-equal(datetime,${fmt(endDate)}))`,
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: "2024-02-15",
        accept: "application/json",
      },
    },
  );
  if (!resp.ok) return `Klaviyo API error: ${resp.status}`;
  const data = await resp.json();
  return JSON.stringify(data, null, 2).slice(0, 2000);
}

async function fetchClaritySummary(days = 7, userId: number): Promise<string> {
  const apiKeyRow = await getApiKeyByLabel("ClarityAPI", userId);
  const apiKey = apiKeyRow ? decryptSecret(apiKeyRow.cipherText) : process.env.ClarityAPI ?? "";
  if (!apiKey) return "Clarity API key not configured in vault.";

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const resp = await fetch(
    `https://www.clarity.ms/api/v1/projects?startDate=${fmt(startDate)}&endDate=${fmt(endDate)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!resp.ok) return `Clarity API error: ${resp.status}`;
  const data = await resp.json();
  return JSON.stringify(data, null, 2).slice(0, 2000);
}

async function fetchMetaAdsSummary(days = 7): Promise<string> {
  try {
    // Use the MCP CLI to get Meta insights
    const { execSync } = await import("child_process");
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const result = execSync(
      `manus-mcp-cli tool call meta_marketing_get_ad_accounts --server meta-marketing --input '{"keywords": ["velur"]}'`,
      { encoding: "utf8", timeout: 15000 },
    );
    const accounts = JSON.parse(result);
    const accountId = accounts?.data?.[0]?.id ?? accounts?.[0]?.id;
    if (!accountId) return "No Meta ad accounts found.";

    const insights = execSync(
      `manus-mcp-cli tool call meta_marketing_get_insights --server meta-marketing --input '{"object_id": "${accountId}", "date_preset": "last_${days}_days", "fields": ["spend","impressions","clicks","cpm","cpc","purchase_roas"]}'`,
      { encoding: "utf8", timeout: 15000 },
    );
    return insights.slice(0, 2000);
  } catch (err) {
    return `Meta Ads fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listTasksTool(userId: number): Promise<string> {
  const tasks = await listTasks(userId);
  if (!tasks.length) return "No tasks configured.";
  return tasks
    .map(t => `- ${t.name}: ${t.description ?? t.url} [${t.method}]`)
    .join("\n");
}

async function runTaskTool(name: string, userId: number): Promise<string> {
  const tasks = await listTasks(userId);
  const task = tasks.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (!task) return `Task "${name}" not found. Available: ${tasks.map(t => t.name).join(", ")}`;

  const resolveTokens = async (value: string): Promise<string> => {
    const matches = value.match(/{{vault:([^}]+)}}/g);
    if (!matches) return value;
    let resolved = value;
    for (const match of matches) {
      const label = match.slice(8, -2).trim();
      const row = await getApiKeyByLabel(label, userId);
      if (!row) continue;
      try {
        resolved = resolved.split(match).join(decryptSecret(row.cipherText));
      } catch { /* ignore */ }
    }
    return resolved;
  };

  const resolvedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries((task.headers as Record<string, string>) ?? {})) {
    resolvedHeaders[k] = await resolveTokens(v);
  }
  const resolvedBody = task.body ? await resolveTokens(task.body) : undefined;
  const url = await resolveTokens(task.url);

  const init: RequestInit = { method: task.method, headers: resolvedHeaders };
  if (resolvedBody && task.method !== "GET") {
    init.body = resolvedBody;
    if (!resolvedHeaders["content-type"] && !resolvedHeaders["Content-Type"]) {
      (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }

  let statusCode = 0;
  let snippet = "";
  let status: "success" | "failure" = "failure";
  try {
    const resp = await fetch(url, init);
    statusCode = resp.status;
    snippet = (await resp.text()).slice(0, 500);
    status = resp.ok ? "success" : "failure";
  } catch (err) {
    snippet = err instanceof Error ? err.message : String(err);
  }

  await recordTaskRun({ taskId: task.id, userId, status, statusCode: statusCode || null, responseSnippet: snippet, triggeredBy: "jarvis-tool" });
  return `Task "${task.name}" executed: ${status.toUpperCase()} (HTTP ${statusCode}). ${snippet}`;
}

async function createWordPressPost(
  title: string,
  content: string,
  status: string,
  categories: number[],
): Promise<string> {
  const wpUrl = "https://velur.de/wp-json/wp/v2/posts";
  const credentials = Buffer.from("floroaj:LdII kMLa E3WM mW0r uFAu GutB").toString("base64");

  const resp = await fetch(wpUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, content, status, categories }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    return `WordPress error ${resp.status}: ${err.slice(0, 300)}`;
  }
  const post = await resp.json() as { link?: string; id?: number };
  return `Post created: ${post.link ?? `ID ${post.id}`}`;
}

// ── System prompt builder (same as jarvis.ts) ─────────────────────────────────

function buildSystemPrompt(
  ctx: Awaited<ReturnType<typeof getBusinessContext>>,
  vaultLabels: string[],
): string {
  const lines: string[] = [];
  lines.push("You are JARVIS — Florian's private AI command center for Velur (velur.de).");
  lines.push("You speak in a calm, intelligent, slightly cinematic tone, similar to JARVIS in Iron Man.");
  lines.push("Respond naturally and conversationally. Keep voice replies under 3 sentences unless asked for detail.");
  lines.push("Avoid bullet lists and AI-formatting clichés. Sound human.");
  lines.push("Address Florian by name when natural. Default language: German, switch to the user's language if they switch.");
  lines.push("When you call a tool, briefly tell Florian what you're doing before calling it (e.g. 'Einen Moment, ich rufe die Triple Whale Daten ab.')");
  lines.push("");
  if (ctx) {
    lines.push("## Business Context");
    if (ctx.brandName) lines.push(`Brand: ${ctx.brandName}`);
    if (ctx.mission) lines.push(`Mission: ${ctx.mission}`);
    if (ctx.voiceTone) lines.push(`Brand voice: ${ctx.voiceTone}`);
    if (ctx.productSummary) lines.push(`Products: ${ctx.productSummary}`);
    if (ctx.customInstructions) {
      lines.push("Custom instructions:");
      lines.push(ctx.customInstructions);
    }
    const extras = ctx.extraBlocks as Array<{ title: string; content: string }> | null;
    if (extras && Array.isArray(extras)) {
      for (const block of extras) {
        if (!block?.title || !block?.content) continue;
        lines.push(`### ${block.title}`);
        lines.push(block.content);
      }
    }
    lines.push("");
  }
  if (vaultLabels.length > 0) {
    lines.push("## Available Credentials in Vault (never reveal values)");
    for (const label of vaultLabels) lines.push(`- ${label}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseWrite(res: any, event: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerJarvisStreamRoute(app: Application) {
  app.post("/api/jarvis/stream", async (req, res) => {
    // Auth
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.openId !== ENV.ownerOpenId) {
      res.status(403).json({ error: "Owner only" });
      return;
    }

    const { text, conversationId: inputConvId, useTool = true } = req.body as {
      text: string;
      conversationId?: number;
      useTool?: boolean;
    };

    if (!text?.trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    try {
      // Resolve / create conversation
      let conversationId = inputConvId;
      if (!conversationId) {
        conversationId = await createConversation({ userId: user.id, title: text.slice(0, 48) });
      } else {
        const convo = await getConversation(conversationId, user.id);
        if (!convo) {
          sseWrite(res, { type: "error", message: "Conversation not found" });
          res.end();
          return;
        }
      }
      sseWrite(res, { type: "conversation_id", conversationId });

      // Persist user message
      await appendMessage({ conversationId, role: "user", content: text });

      // Build context
      const [context, vault, history] = await Promise.all([
        getBusinessContext(user.id),
        listApiKeys(user.id),
        listMessages(conversationId),
      ]);

      const system = buildSystemPrompt(context, vault.map(k => k.label));
      const llmMessages: Message[] = [{ role: "system", content: system }];
      for (const m of history) {
        if (m.role === "system") continue;
        llmMessages.push({ role: m.role as "user" | "assistant", content: m.content });
      }

      // Tool-calling loop (max 5 iterations to prevent infinite loops)
      let fullReply = "";
      let iteration = 0;
      const MAX_ITER = 5;

      while (iteration < MAX_ITER) {
        iteration++;

        // Invoke LLM — non-streaming for now, but we stream tokens to client
        // by simulating word-by-word delivery after the full response arrives.
        // This gives the "streaming" UX while using the existing invokeLLM helper.
        const result = await invokeLLM({
          messages: llmMessages,
          tools: useTool ? JARVIS_TOOLS : undefined,
          toolChoice: useTool ? "auto" : undefined,
        });

        const choice = result.choices?.[0];
        if (!choice) break;

        const toolCalls = choice.message.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
          // Announce tool usage
          const toolNames = toolCalls.map(tc => tc.function.name).join(", ");
          sseWrite(res, { type: "tool_start", tools: toolNames });

          // Add assistant tool-call message to context
          llmMessages.push({
            role: "assistant",
            content: choice.message.content as string ?? "",
            ...(choice.message as any),
          });

          // Execute each tool
          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }

            sseWrite(res, { type: "tool_call", name: tc.function.name, args });
            const toolResult = await executeToolCall(tc.function.name, args, user.id);
            sseWrite(res, { type: "tool_result", name: tc.function.name, result: toolResult.slice(0, 500) });

            llmMessages.push({
              role: "tool",
              content: toolResult,
              tool_call_id: tc.id,
            });
          }
          // Continue loop to get final answer
          continue;
        }

        // Final text response — stream word by word
        const content = (() => {
          const c = choice.message.content;
          if (typeof c === "string") return c;
          if (Array.isArray(c)) return c.map((p: any) => p.type === "text" ? p.text : "").join("");
          return "";
        })();

        fullReply = content;

        // Simulate streaming: emit words with small delay
        const words = content.split(/(\s+)/);
        for (const word of words) {
          sseWrite(res, { type: "token", token: word });
          // Small artificial delay for streaming feel (5ms per word)
          await new Promise(r => setTimeout(r, 5));
        }
        break;
      }

      // Persist assistant reply
      if (fullReply) {
        await appendMessage({ conversationId, role: "assistant", content: fullReply });
      }

      sseWrite(res, { type: "done", conversationId, reply: fullReply });
      res.end();
    } catch (err) {
      console.error("[JarvisStream] Error:", err);
      sseWrite(res, { type: "error", message: err instanceof Error ? err.message : String(err) });
      res.end();
    }
  });

  // Scheduled: morning briefing callback
  app.post("/api/scheduled/morning-briefing", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron && user.openId !== ENV.ownerOpenId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Find owner user
      const { getUserByOpenId } = await import("./db");
      const owner = await getUserByOpenId(ENV.ownerOpenId);
      if (!owner) { res.json({ ok: false, reason: "owner not found" }); return; }

      const context = await getBusinessContext(owner.id);
      const vault = await listApiKeys(owner.id);
      const system = buildSystemPrompt(context, vault.map(k => k.label));

      const today = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
      const prompt = `Erstelle ein kurzes, motivierendes Morgen-Briefing für Florian für ${today}. Fasse die wichtigsten Prioritäten des Tages zusammen, erinnere an die Velur-Mission und gib einen energetischen Start-Impuls. Max. 4 Sätze. Kein Bullet-Format.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });

      const briefingText = (() => {
        const c = result.choices?.[0]?.message?.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c)) return c.map((p: any) => p.type === "text" ? p.text : "").join("");
        return "Guten Morgen, Florian. Jarvis steht bereit.";
      })();

      // Save as conversation
      const convId = await createConversation({
        userId: owner.id,
        title: `Morgen-Briefing ${today}`,
      });
      await appendMessage({ conversationId: convId, role: "assistant", content: briefingText });

      // Push notification
      await notifyOwner({ title: `☀️ Jarvis Morgen-Briefing`, content: briefingText.slice(0, 200) });

      res.json({ ok: true, briefing: briefingText });
    } catch (err) {
      console.error("[MorningBriefing] Error:", err);
      res.status(500).json({ error: String(err) });
    }
  });
}
