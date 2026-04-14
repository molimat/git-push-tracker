import { Router, type Request, type Response } from "express";
import { eq, desc, and, gte } from "drizzle-orm";
import type { AppDb } from "../db/index.js";
import { pushSummaries, projects } from "../db/schema.js";
import { createBearerAuth } from "./auth.js";

export function createApiRouter(db: AppDb) {
  const router = Router();

  router.use(createBearerAuth(db));

  router.get("/pushes", (req: Request, res: Response) => {
    const projectId = req.projectId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const branch = req.query.branch as string | undefined;
    const since = req.query.since as string | undefined;

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }

    // Build conditions
    const conditions = [eq(pushSummaries.projectId, projectId)];

    if (branch) {
      conditions.push(eq(pushSummaries.branch, branch));
    }

    if (since) {
      const sinceTs = new Date(since).getTime();
      if (!isNaN(sinceTs)) {
        conditions.push(gte(pushSummaries.generatedAt, sinceTs));
      }
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = db
      .select()
      .from(pushSummaries)
      .where(where)
      .orderBy(desc(pushSummaries.generatedAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Get total count for pagination
    const allRows = db
      .select()
      .from(pushSummaries)
      .where(where)
      .all();

    res.json({
      project: project.name,
      pushes: rows.map((r) => ({
        id: r.id,
        branch: r.branch,
        author: r.author,
        commitCount: r.commitCount,
        summary: r.summary,
        pushedAt: new Date(r.generatedAt).toISOString(),
      })),
      pagination: {
        limit,
        offset,
        total: allRows.length,
      },
    });
  });

  return router;
}
