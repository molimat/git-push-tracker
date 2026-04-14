import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

export function createDb(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      webhook_secret TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS raw_pushes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      payload TEXT NOT NULL,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      commit_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      received_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_summaries (
      id TEXT PRIMARY KEY,
      raw_push_id TEXT NOT NULL REFERENCES raw_pushes(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      commit_count INTEGER NOT NULL,
      generated_at INTEGER NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { db };
}

export type AppDb = ReturnType<typeof createDb>["db"];
