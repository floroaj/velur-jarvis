import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appendMessage,
  createApiKey,
  createConversation,
  createTask,
  deleteApiKey,
  deleteConversation,
  deleteTask,
  getApiKey,
  getApiKeyByLabel,
  getBusinessContext,
  getConversation,
  getTask,
  listApiKeys,
  listConversations,
  listMessages,
  listTaskRuns,
  listTasks,
  recordTaskRun,
  touchConversation,
  updateApiKey,
  updateTask,
  upsertBusinessContext,
} from "./db";
import { decryptSecret, encryptSecret, maskSecret } from "./_core/crypto";
import { pingAllConnectors } from "./_core/connectorHealth";
import { ENV } from "./_core/env";
import { invokeLLM, type Message } from "./_core/llm";
import { generateSpeech } from "./_core/tts";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { protectedProcedure, router } from "./_core/trpc";

/**
 * Owner-only guard: Jarvis is a private command center for Florian.
 */
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ENV.ownerOpenId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OWNER_OPEN_ID not configured" });
  }
  if (ctx.user.openId !== ENV.ownerOpenId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Jarvis is owner-only" });
  }
  return next({ ctx });
});

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof getBusinessContext>>, vaultLabels: string[]): string {
  const lines: string[] = [];
  lines.push("You are JARVIS — Florian's private AI command center for Velur (velur.de).");
  lines.push("You speak in a calm, intelligent, slightly cinematic tone, similar to JARVIS in Iron Man.");
  lines.push("Respond naturally and conversationally. Keep voice replies under 3 sentences unless asked for detail.");
  lines.push("Avoid bullet lists and AI-formatting clichés (no double hyphens). Sound human.");
  lines.push("Address Florian by name when natural. Default language: German, switch to the user's language if they switch.");
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
    if (extras && Array.isArray(extras) && extras.length > 0) {
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
  lines.push("If Florian asks Jarvis to run a task, refer to the configured tasks panel; you can list them but execution happens through the task system. Confirm critical actions before recommending them.");
  return lines.join("\n");
}

export const jarvisRouter = router({
  /* ----- Conversations ----- */
  listConversations: ownerProcedure.query(({ ctx }) => listConversations(ctx.user.id)),

  getConversation: ownerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const convo = await getConversation(input.id, ctx.user.id);
      if (!convo) throw new TRPCError({ code: "NOT_FOUND" });
      const msgs = await listMessages(input.id);
      return { conversation: convo, messages: msgs };
    }),

  newConversation: ownerProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await createConversation({
        userId: ctx.user.id,
        title: input.title ?? "New conversation",
      });
      return { id };
    }),

  renameConversation: ownerProcedure
    .input(z.object({ id: z.number(), title: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const convo = await getConversation(input.id, ctx.user.id);
      if (!convo) throw new TRPCError({ code: "NOT_FOUND" });
      await touchConversation(input.id, input.title);
      return { success: true };
    }),

  deleteConversation: ownerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteConversation(input.id, ctx.user.id);
      return { success: true };
    }),

  /* ----- Chat ----- */
  sendMessage: ownerProcedure
    .input(z.object({ conversationId: z.number().optional(), text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      let conversationId = input.conversationId;
      if (!conversationId) {
        conversationId = await createConversation({
          userId: ctx.user.id,
          title: input.text.slice(0, 48),
        });
      } else {
        const convo = await getConversation(conversationId, ctx.user.id);
        if (!convo) throw new TRPCError({ code: "NOT_FOUND" });
      }

      await appendMessage({
        conversationId,
        role: "user",
        content: input.text,
      });

      const [context, vault, history] = await Promise.all([
        getBusinessContext(ctx.user.id),
        listApiKeys(ctx.user.id),
        listMessages(conversationId),
      ]);

      const system = buildSystemPrompt(context, vault.map(k => k.label));

      const llmMessages: Message[] = [{ role: "system", content: system }];
      for (const m of history) {
        if (m.role === "system") continue;
        llmMessages.push({ role: m.role as "user" | "assistant", content: m.content });
      }

      const response = await invokeLLM({ messages: llmMessages });
      const assistantContent = (() => {
        const choice = response.choices?.[0]?.message?.content;
        if (typeof choice === "string") return choice;
        if (Array.isArray(choice)) {
          return choice
            .map(part => (part.type === "text" ? part.text : ""))
            .join("");
        }
        return "";
      })();

      await appendMessage({
        conversationId,
        role: "assistant",
        content: assistantContent || "(no response)",
      });
      await touchConversation(conversationId);

      return { conversationId, reply: assistantContent };
    }),

  /* ----- Voice ----- */
  uploadAudio: ownerProcedure
    .input(z.object({ dataBase64: z.string().min(1), mimeType: z.string().default("audio/webm") }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.dataBase64, "base64");
      if (buffer.byteLength === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Empty audio" });
      const ext = input.mimeType.includes("wav") ? "wav" : input.mimeType.includes("mp4") ? "m4a" : "webm";
      const stored = await storagePut(`jarvis-voice/clip.${ext}`, buffer, input.mimeType);
      return stored;
    }),

  transcribe: ownerProcedure
    .input(z.object({ audioUrl: z.string(), language: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await transcribeAudio({ audioUrl: input.audioUrl, language: input.language ?? "de" });
      if ("error" in result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return { text: result.text, language: result.language, duration: result.duration };
    }),

  speak: ownerProcedure
    .input(z.object({ text: z.string().min(1).max(4000), voice: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await generateSpeech({ text: input.text, voice: input.voice });
      return result;
    }),

  /* ----- Business context ----- */
  getContext: ownerProcedure.query(async ({ ctx }) => {
    const existing = await getBusinessContext(ctx.user.id);
    return existing ?? null;
  }),

  updateContext: ownerProcedure
    .input(
      z.object({
        brandName: z.string().min(1).max(255),
        mission: z.string().nullable().optional(),
        voiceTone: z.string().nullable().optional(),
        productSummary: z.string().nullable().optional(),
        customInstructions: z.string().nullable().optional(),
        extraBlocks: z
          .array(z.object({ title: z.string(), content: z.string() }))
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await upsertBusinessContext({
        userId: ctx.user.id,
        brandName: input.brandName,
        mission: input.mission ?? null,
        voiceTone: input.voiceTone ?? null,
        productSummary: input.productSummary ?? null,
        customInstructions: input.customInstructions ?? null,
        extraBlocks: (input.extraBlocks ?? null) as any,
      });
      return { success: true };
    }),

  /* ----- Vault ----- */
  vaultList: ownerProcedure.query(async ({ ctx }) => {
    const rows = await listApiKeys(ctx.user.id);
    return rows.map(row => {
      let preview = "";
      try {
        preview = maskSecret(decryptSecret(row.cipherText));
      } catch {
        preview = "•••••";
      }
      return {
        id: row.id,
        label: row.label,
        service: row.service,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        preview,
      };
    });
  }),

  vaultUpsert: ownerProcedure
    .input(
      z.object({
        id: z.number().optional(),
        label: z.string().min(1).max(128),
        service: z.string().min(1).max(64),
        secret: z.string().min(1),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const keep = input.id && input.secret === "__keep__";
      if (input.id) {
        const patch: Partial<{ label: string; service: string; cipherText: string; notes: string | null }> = {
          label: input.label,
          service: input.service,
          notes: input.notes ?? null,
        };
        if (!keep) {
          patch.cipherText = encryptSecret(input.secret);
        }
        await updateApiKey(input.id, ctx.user.id, patch);
        return { id: input.id };
      }
      const cipherText = encryptSecret(input.secret);
      const id = await createApiKey({
        userId: ctx.user.id,
        label: input.label,
        service: input.service,
        cipherText,
        notes: input.notes ?? null,
      });
      return { id };
    }),

  vaultReveal: ownerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const key = await getApiKey(input.id, ctx.user.id);
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      try {
        return { secret: decryptSecret(key.cipherText) };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Decryption failed" });
      }
    }),

  vaultDelete: ownerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteApiKey(input.id, ctx.user.id);
      return { success: true };
    }),

  /* ----- Tasks ----- */
  tasksList: ownerProcedure.query(async ({ ctx }) => listTasks(ctx.user.id)),

  taskRuns: ownerProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => listTaskRuns(input.taskId, ctx.user.id)),

  taskUpsert: ownerProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(128),
        description: z.string().nullable().optional(),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
        url: z.string().url(),
        headers: z.record(z.string(), z.string()).nullable().optional(),
        body: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        await updateTask(input.id, ctx.user.id, {
          name: input.name,
          description: input.description ?? null,
          method: input.method,
          url: input.url,
          headers: (input.headers ?? null) as any,
          body: input.body ?? null,
        });
        return { id: input.id };
      }
      const id = await createTask({
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        method: input.method,
        url: input.url,
        headers: (input.headers ?? null) as any,
        body: input.body ?? null,
      });
      return { id };
    }),

  taskDelete: ownerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteTask(input.id, ctx.user.id);
      return { success: true };
    }),

  taskRun: ownerProcedure
    .input(z.object({ id: z.number(), triggeredBy: z.string().default("manual") }))
    .mutation(async ({ ctx, input }) => {
      const task = await getTask(input.id, ctx.user.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      // Resolve {{vault:label}} placeholders before sending the HTTP request.
      const resolveTokens = async (value: string): Promise<string> => {
        const matches = value.match(/{{vault:([^}]+)}}/g);
        if (!matches) return value;
        let resolved = value;
        for (const match of matches) {
          const label = match.slice(8, -2).trim();
          const row = await getApiKeyByLabel(label, ctx.user.id);
          if (!row) continue;
          try {
            const secret = decryptSecret(row.cipherText);
            resolved = resolved.split(match).join(secret);
          } catch {
            // ignore decryption failures so we never leak placeholder issues
          }
        }
        return resolved;
      };

      const resolvedHeaders: Record<string, string> = {};
      const rawHeaders = (task.headers as Record<string, string> | null) ?? {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        resolvedHeaders[k] = await resolveTokens(v);
      }
      const resolvedBody = task.body ? await resolveTokens(task.body) : undefined;

      const url = await resolveTokens(task.url);

      const init: RequestInit = {
        method: task.method,
        headers: resolvedHeaders,
      };
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
        const text = await resp.text();
        snippet = text.slice(0, 800);
        status = resp.ok ? "success" : "failure";
      } catch (err) {
        snippet = err instanceof Error ? err.message : String(err);
      }

      await recordTaskRun({
        taskId: task.id,
        userId: ctx.user.id,
        status,
        statusCode: statusCode || null,
        responseSnippet: snippet,
        triggeredBy: input.triggeredBy,
      });

      return { status, statusCode, snippet };
    }),

  setupSchedule: ownerProcedure
    .query(async ({ ctx }) => {
      const { ensureAllJarvisJobs } = await import("./jarvisSchedule");
      const { COOKIE_NAME } = await import("../shared/const");
      const { parse: parseCookieHeader } = await import("cookie");
      const cookieHeader = ctx.req.headers.cookie ?? "";
      const cookies = parseCookieHeader(cookieHeader);
      const session = cookies[COOKIE_NAME] ?? "";
      await ensureAllJarvisJobs(session);
      return { ok: true };
    }),

  connectorHealth: ownerProcedure
    .query(async ({ ctx }) => {
      const health = await pingAllConnectors(ctx.user.id);
      return health;
    }),
});
