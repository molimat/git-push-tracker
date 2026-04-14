import { describe, it, expect, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedProject, seedRawPush } from "../helpers/setup.js";
import { startWorker } from "../../src/worker/index.js";
import { rawPushes, pushSummaries } from "../../src/db/schema.js";
import type { GeminiClient } from "../../src/gemini/index.js";
import type { AppDb } from "../../src/db/index.js";

function mockGemini(response = "AI summary of changes"): GeminiClient {
  return {
    generateSummary: vi.fn().mockResolvedValue(response),
  };
}

function failingGemini(): GeminiClient {
  return {
    generateSummary: vi.fn().mockRejectedValue(new Error("API error")),
  };
}

// Each test gets its own DB to avoid cross-test pollution
function setupDb() {
  const { db, cleanup } = createTestDb();
  return { db, cleanup };
}

describe("worker processNow", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  });

  function freshDb() {
    const { db, cleanup } = setupDb();
    cleanups.push(cleanup);
    return db;
  }

  it("processes pending push and creates summary", async () => {
    const db = freshDb();
    const project = seedProject(db, { name: "worker-test" });
    const rp = seedRawPush(db, project.id, { status: "pending" });
    const gemini = mockGemini("Summary: added login");

    const worker = startWorker(db, gemini, 999999, 3);
    await worker.processNow();
    worker.stop();

    const updated = db.select().from(rawPushes).where(eq(rawPushes.id, rp.id)).get();
    expect(updated!.status).toBe("done");

    const summary = db
      .select()
      .from(pushSummaries)
      .where(eq(pushSummaries.rawPushId, rp.id))
      .get();

    expect(summary).toBeDefined();
    expect(summary!.summary).toBe("Summary: added login");
    expect(summary!.branch).toBe("main");
    expect(summary!.author).toBe("testuser");
    expect(gemini.generateSummary).toHaveBeenCalledOnce();
  });

  it("does nothing when no pending pushes", async () => {
    const db = freshDb();
    const gemini = mockGemini();

    const worker = startWorker(db, gemini, 999999, 3);
    await worker.processNow();
    worker.stop();

    expect(gemini.generateSummary).not.toHaveBeenCalled();
  });

  it("retries on failure when attempts < maxRetries", async () => {
    const db = freshDb();
    const project = seedProject(db, { name: "retry-test" });
    const rp = seedRawPush(db, project.id, { status: "pending", attempts: 0 });
    const gemini = failingGemini();

    const worker = startWorker(db, gemini, 999999, 3);
    await worker.processNow();
    worker.stop();

    const updated = db.select().from(rawPushes).where(eq(rawPushes.id, rp.id)).get();
    expect(updated!.status).toBe("pending");
    expect(updated!.attempts).toBe(1);
  });

  it("marks as failed when attempts reach maxRetries", async () => {
    const db = freshDb();
    const project = seedProject(db, { name: "max-retry" });
    const rp = seedRawPush(db, project.id, { status: "pending", attempts: 2 });
    const gemini = failingGemini();

    const worker = startWorker(db, gemini, 999999, 3);
    await worker.processNow();
    worker.stop();

    const updated = db.select().from(rawPushes).where(eq(rawPushes.id, rp.id)).get();
    expect(updated!.status).toBe("failed");
    expect(updated!.attempts).toBe(3);
  });

  it("stop() prevents further processing", async () => {
    const db = freshDb();
    const gemini = mockGemini();
    const worker = startWorker(db, gemini, 100, 3);
    worker.stop();

    await new Promise((r) => setTimeout(r, 300));
    expect(gemini.generateSummary).not.toHaveBeenCalled();
  });
});
