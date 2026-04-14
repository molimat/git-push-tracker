import { eq, and, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/index.js";
import { rawPushes, pushSummaries, projects } from "../db/schema.js";
import type { GeminiClient } from "../gemini/index.js";
import type { NormalizedPush } from "../webhooks/github.js";

export function startWorker(
  db: AppDb,
  gemini: GeminiClient,
  intervalMs: number,
  maxRetries: number
) {
  async function processPending() {
    const pending = db
      .select()
      .from(rawPushes)
      .where(
        and(eq(rawPushes.status, "pending"), lt(rawPushes.attempts, maxRetries))
      )
      .limit(1)
      .get();

    if (!pending) return;

    // Mark as processing
    db.update(rawPushes)
      .set({ status: "processing" })
      .where(eq(rawPushes.id, pending.id))
      .run();

    try {
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, pending.projectId))
        .get();

      if (!project) {
        db.update(rawPushes)
          .set({ status: "failed" })
          .where(eq(rawPushes.id, pending.id))
          .run();
        return;
      }

      const payload = JSON.parse(pending.payload) as Record<string, unknown>;
      const push: NormalizedPush = {
        branch: pending.branch,
        author: pending.author,
        commitCount: pending.commitCount,
        commits: extractCommits(payload, pending.provider),
      };

      const summary = await gemini.generateSummary(project.name, push);

      db.insert(pushSummaries)
        .values({
          id: randomUUID(),
          rawPushId: pending.id,
          projectId: pending.projectId,
          summary,
          branch: pending.branch,
          author: pending.author,
          commitCount: pending.commitCount,
          generatedAt: Date.now(),
        })
        .run();

      db.update(rawPushes)
        .set({ status: "done" })
        .where(eq(rawPushes.id, pending.id))
        .run();

      console.log(`[worker] Processed push ${pending.id} for ${project.name}`);
    } catch (error) {
      const newAttempts = pending.attempts + 1;
      const newStatus = newAttempts >= maxRetries ? "failed" : "pending";

      db.update(rawPushes)
        .set({ status: newStatus, attempts: newAttempts })
        .where(eq(rawPushes.id, pending.id))
        .run();

      console.error(
        `[worker] Failed to process push ${pending.id} (attempt ${newAttempts}/${maxRetries}):`,
        error
      );
    }
  }

  const timer = setInterval(processPending, intervalMs);
  console.log(`[worker] Started, polling every ${intervalMs}ms`);

  return {
    stop: () => clearInterval(timer),
    processNow: processPending,
  };
}

function extractCommits(
  payload: Record<string, unknown>,
  provider: string
): NormalizedPush["commits"] {
  const commits =
    (payload.commits as Array<Record<string, unknown>>) || [];

  return commits.map((c) => ({
    id: c.id as string,
    message: c.message as string,
    author:
      provider === "github"
        ? (c.author as { name: string }).name
        : (c.author as { name: string }).name,
    added: (c.added as string[]) || [],
    modified: (c.modified as string[]) || [],
    removed: (c.removed as string[]) || [],
  }));
}
