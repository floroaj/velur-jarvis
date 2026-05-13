/**
 * Conversation History Summarizer
 *
 * When a conversation has > 20 messages, the oldest 15 are replaced in the
 * LLM context by a single summary message. The summary is cached in the
 * conversations.summaryCache column and regenerated only when new messages
 * have been added beyond the last summarized point.
 *
 * This keeps the LLM context window lean while preserving full history in DB.
 */
import { eq, and, lte, gt } from "drizzle-orm";
import { getDb } from "../db";
import { conversations, messages } from "../../drizzle/schema";
import { invokeLLM, type Message } from "./llm";

const SUMMARIZE_THRESHOLD = 20; // summarize when history exceeds this
const MESSAGES_TO_SUMMARIZE = 15; // how many old messages to collapse

export interface SummarizedHistory {
  /** Messages to pass to the LLM (summary + recent) */
  llmMessages: Message[];
  /** Whether a summary was applied */
  summarized: boolean;
}

/**
 * Load conversation history and apply summarization if needed.
 * Returns the LLM-ready message array (system message NOT included).
 */
export async function getHistoryForLLM(
  conversationId: number,
  rawMessages: Array<{ id: number; role: string; content: string }>,
): Promise<SummarizedHistory> {
  // Filter out system messages — those are rebuilt from context each time
  const history = rawMessages.filter(m => m.role !== "system");

  if (history.length <= SUMMARIZE_THRESHOLD) {
    return {
      llmMessages: history.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      summarized: false,
    };
  }

  // We need to summarize: check if cached summary is still valid
  const db = await getDb();
  if (!db) {
    // No DB — fall back to last 20 messages
    return {
      llmMessages: history.slice(-20).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      summarized: false,
    };
  }

  const convRows = await db
    .select({ summaryCache: conversations.summaryCache, summarizedUpTo: conversations.summarizedUpTo })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const conv = convRows[0];
  const toSummarize = history.slice(0, MESSAGES_TO_SUMMARIZE);
  const lastToSummarizeId = toSummarize[toSummarize.length - 1]?.id ?? 0;
  const recent = history.slice(MESSAGES_TO_SUMMARIZE);

  let summaryText: string;

  if (conv?.summaryCache && conv.summarizedUpTo === lastToSummarizeId) {
    // Cache hit — reuse existing summary
    summaryText = conv.summaryCache;
  } else {
    // Cache miss — generate new summary via LLM
    summaryText = await generateSummary(toSummarize);

    // Persist to DB
    await db
      .update(conversations)
      .set({ summaryCache: summaryText, summarizedUpTo: lastToSummarizeId })
      .where(eq(conversations.id, conversationId));
  }

  const llmMessages: Message[] = [
    {
      role: "system",
      content: `[Conversation summary — earlier context]\n${summaryText}`,
    },
    ...recent.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  return { llmMessages, summarized: true };
}

async function generateSummary(
  msgs: Array<{ role: string; content: string }>,
): Promise<string> {
  const transcript = msgs
    .map(m => `${m.role === "user" ? "Florian" : "Jarvis"}: ${m.content}`)
    .join("\n");

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a concise summarizer. Summarize the following conversation excerpt in 3-5 sentences, " +
          "preserving key decisions, facts, and context that would be important for continuing the conversation. " +
          "Write in third person. Be factual and brief.",
      },
      {
        role: "user",
        content: `Summarize this conversation:\n\n${transcript}`,
      },
    ],
  });

  return result.choices[0]?.message.content as string ?? "No summary available.";
}
