import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Conversation thread groupings.
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull().default("New conversation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Individual chat messages persisted in the transcript.
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  audioUrl: varchar("audioUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Business context blocks injected into the system prompt.
 */
export const businessContext = mysqlTable("business_context", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  brandName: varchar("brandName", { length: 255 }).notNull().default("Velur"),
  mission: text("mission"),
  voiceTone: text("voiceTone"),
  productSummary: text("productSummary"),
  customInstructions: text("customInstructions"),
  extraBlocks: json("extraBlocks"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BusinessContext = typeof businessContext.$inferSelect;
export type InsertBusinessContext = typeof businessContext.$inferInsert;

/**
 * Encrypted API key vault (AES-256-GCM).
 * `cipherText` stores `iv:tag:ciphertext` base64 encoded.
 */
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  service: varchar("service", { length: 64 }).notNull(),
  cipherText: text("cipherText").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

/**
 * Configurable tasks (webhooks / HTTP actions) Jarvis can trigger.
 * `headers` and `body` are JSON; tokens may reference vault entries via {{vault:label}}.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  method: mysqlEnum("method", ["GET", "POST", "PUT", "PATCH", "DELETE"]).notNull().default("POST"),
  url: varchar("url", { length: 1024 }).notNull(),
  headers: json("headers"),
  body: text("body"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Audit log of task executions.
 */
export const taskRuns = mysqlTable("task_runs", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["success", "failure"]).notNull(),
  statusCode: int("statusCode"),
  responseSnippet: text("responseSnippet"),
  triggeredBy: varchar("triggeredBy", { length: 32 }).notNull().default("manual"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskRun = typeof taskRuns.$inferSelect;
export type InsertTaskRun = typeof taskRuns.$inferInsert;
