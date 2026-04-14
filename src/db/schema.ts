import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // 'github' | 'gitlab'
  repoUrl: text("repo_url").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  keyRaw: text("key_raw").notNull(),
  label: text("label"),
  createdAt: integer("created_at").notNull(),
});

export const rawPushes = sqliteTable("raw_pushes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  payload: text("payload").notNull(),
  branch: text("branch").notNull(),
  author: text("author").notNull(),
  commitCount: integer("commit_count").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | done | failed
  attempts: integer("attempts").notNull().default(0),
  receivedAt: integer("received_at").notNull(),
});

export const pushSummaries = sqliteTable("push_summaries", {
  id: text("id").primaryKey(),
  rawPushId: text("raw_push_id")
    .notNull()
    .references(() => rawPushes.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  branch: text("branch").notNull(),
  author: text("author").notNull(),
  commitCount: integer("commit_count").notNull(),
  generatedAt: integer("generated_at").notNull(),
});
