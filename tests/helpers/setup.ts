import { randomUUID, randomBytes, createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync } from "node:fs";
import express from "express";
import { createDb, type AppDb } from "../../src/db/index.js";
import { projects, apiKeys, rawPushes, pushSummaries } from "../../src/db/schema.js";
import { createWebhookRouter } from "../../src/webhooks/router.js";
import { createApiRouter } from "../../src/api/router.js";
import { createAdminRouter } from "../../src/admin/router.js";

export const TEST_ADMIN_USER = "testadmin";
export const TEST_ADMIN_PASS = "testpass";

export function createTestDb() {
  const dbPath = join(tmpdir(), `pushlog-test-${randomUUID()}.db`);
  const { db } = createDb(dbPath);

  function cleanup() {
    try {
      unlinkSync(dbPath);
      unlinkSync(dbPath + "-wal");
      unlinkSync(dbPath + "-shm");
    } catch {
      // Files may not exist
    }
  }

  return { db, cleanup };
}

export function createTestApp(db: AppDb) {
  const app = express();
  app.use(express.json());
  app.use("/webhooks", createWebhookRouter(db));
  app.use("/api/v1", createApiRouter(db));
  app.use("/admin", createAdminRouter(db, TEST_ADMIN_USER, TEST_ADMIN_PASS));
  return app;
}

export function seedProject(
  db: AppDb,
  overrides?: Partial<{
    id: string;
    name: string;
    provider: string;
    repoUrl: string;
    webhookSecret: string;
  }>
) {
  const record = {
    id: overrides?.id ?? randomUUID(),
    name: overrides?.name ?? "test-project",
    provider: overrides?.provider ?? "github",
    repoUrl: overrides?.repoUrl ?? "https://github.com/test/repo",
    webhookSecret: overrides?.webhookSecret ?? randomBytes(32).toString("hex"),
    createdAt: Date.now(),
  };

  db.insert(projects).values(record).run();
  return record;
}

export function seedApiKey(db: AppDb, projectId: string) {
  const rawKey = `gpt_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const id = randomUUID();

  db.insert(apiKeys)
    .values({
      id,
      projectId,
      keyHash,
      keyRaw: rawKey,
      label: "test-key",
      createdAt: Date.now(),
    })
    .run();

  return { id, rawKey, keyHash };
}

export function seedRawPush(
  db: AppDb,
  projectId: string,
  overrides?: Partial<{
    id: string;
    provider: string;
    payload: string;
    branch: string;
    author: string;
    commitCount: number;
    status: string;
    attempts: number;
  }>
) {
  const record = {
    id: overrides?.id ?? randomUUID(),
    projectId,
    provider: overrides?.provider ?? "github",
    payload: overrides?.payload ?? JSON.stringify({
      commits: [
        {
          id: "abc123",
          message: "test commit",
          author: { name: "testuser" },
          added: ["file.ts"],
          modified: [],
          removed: [],
        },
      ],
    }),
    branch: overrides?.branch ?? "main",
    author: overrides?.author ?? "testuser",
    commitCount: overrides?.commitCount ?? 1,
    status: overrides?.status ?? "pending",
    attempts: overrides?.attempts ?? 0,
    receivedAt: Date.now(),
  };

  db.insert(rawPushes).values(record).run();
  return record;
}

export function seedPushSummary(
  db: AppDb,
  projectId: string,
  rawPushId: string,
  overrides?: Partial<{
    id: string;
    summary: string;
    branch: string;
    author: string;
    commitCount: number;
    generatedAt: number;
  }>
) {
  const record = {
    id: overrides?.id ?? randomUUID(),
    rawPushId,
    projectId,
    summary: overrides?.summary ?? "Test summary of changes",
    branch: overrides?.branch ?? "main",
    author: overrides?.author ?? "testuser",
    commitCount: overrides?.commitCount ?? 1,
    generatedAt: overrides?.generatedAt ?? Date.now(),
  };

  db.insert(pushSummaries).values(record).run();
  return record;
}
