import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apiKeys,
  businessContext,
  conversations,
  InsertApiKey,
  InsertBusinessContext,
  InsertConversation,
  InsertMessage,
  InsertTask,
  InsertTaskRun,
  InsertUser,
  messages,
  taskRuns,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Fallback: find the first admin user when OWNER_OPEN_ID env is not available */
export async function getUserByRole(role: "admin" | "user") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.role, role)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* Conversations */
export async function listConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

export async function createConversation(values: InsertConversation) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(conversations).values(values);
  const id = (result as any)[0]?.insertId ?? (result as any).insertId;
  return id as number;
}

export async function touchConversation(conversationId: number, title?: string) {
  const db = await getDb();
  if (!db) return;
  if (title) {
    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } else {
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }
}

export async function deleteConversation(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(messages)
    .where(eq(messages.conversationId, conversationId));
  await db
    .delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
}

export async function getConversation(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return rows[0];
}

/* Messages */
export async function listMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.id);
}

export async function appendMessage(values: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(messages).values(values);
}

/* Business context */
export async function getBusinessContext(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(businessContext)
    .where(eq(businessContext.userId, userId))
    .limit(1);
  return rows[0];
}

export async function upsertBusinessContext(values: InsertBusinessContext) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getBusinessContext(values.userId);
  if (existing) {
    await db
      .update(businessContext)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(businessContext.id, existing.id));
    return existing.id;
  }
  const result = await db.insert(businessContext).values(values);
  return (result as any)[0]?.insertId ?? (result as any).insertId;
}

/* Vault */
export async function listApiKeys(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.updatedAt));
}

export async function getApiKey(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getApiKeyByLabel(label: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.label, label), eq(apiKeys.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function createApiKey(values: InsertApiKey) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(apiKeys).values(values);
  return (result as any)[0]?.insertId ?? (result as any).insertId;
}

export async function updateApiKey(
  id: number,
  userId: number,
  patch: Partial<InsertApiKey>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(apiKeys)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
}

export async function deleteApiKey(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
}

/* Tasks */
export async function listTasks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.updatedAt));
}

export async function getTask(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function createTask(values: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(tasks).values(values);
  return (result as any)[0]?.insertId ?? (result as any).insertId;
}

export async function updateTask(
  id: number,
  userId: number,
  patch: Partial<InsertTask>,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

export async function deleteTask(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

export async function recordTaskRun(values: InsertTaskRun) {
  const db = await getDb();
  if (!db) return;
  await db.insert(taskRuns).values(values);
}

export async function listTaskRuns(taskId: number, userId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(taskRuns)
    .where(and(eq(taskRuns.taskId, taskId), eq(taskRuns.userId, userId)))
    .orderBy(desc(taskRuns.createdAt))
    .limit(limit);
}
