import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppDb } from "../db/index.js";
import { projects, apiKeys, rawPushes, pushSummaries } from "../db/schema.js";
import { createBasicAuth } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createAdminRouter(
  db: AppDb,
  adminUser: string,
  adminPass: string
) {
  const router = Router();
  const auth = createBasicAuth(adminUser, adminPass);

  // Serve admin UI (public — login is handled client-side)
  router.get("/", (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, "ui", "index.html"));
  });

  // Protect all API routes
  router.use("/api", auth);

  // List projects
  router.get("/api/projects", (_req: Request, res: Response) => {
    const allProjects = db.select().from(projects).all();

    const result = allProjects.map((p) => {
      const keys = db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.projectId, p.id))
        .all();

      const pendingCount = db
        .select()
        .from(rawPushes)
        .where(eq(rawPushes.projectId, p.id))
        .all()
        .filter((r) => r.status === "pending").length;

      const processedCount = db
        .select()
        .from(pushSummaries)
        .where(eq(pushSummaries.projectId, p.id))
        .all().length;

      return {
        ...p,
        keys: keys.map((k) => ({
          id: k.id,
          key: k.keyRaw,
          label: k.label,
          createdAt: k.createdAt,
        })),
        stats: { pending: pendingCount, processed: processedCount },
      };
    });

    res.json(result);
  });

  // Create project
  router.post("/api/projects", (req: Request, res: Response) => {
    const { name, provider, repoUrl } = req.body;

    if (!name || !provider || !repoUrl) {
      res
        .status(400)
        .json({ error: "name, provider, and repoUrl are required" });
      return;
    }

    if (!["github", "gitlab"].includes(provider)) {
      res.status(400).json({ error: "provider must be github or gitlab" });
      return;
    }

    const id = randomUUID();
    const webhookSecret = randomBytes(32).toString("hex");

    db.insert(projects)
      .values({
        id,
        name,
        provider,
        repoUrl,
        webhookSecret,
        createdAt: Date.now(),
      })
      .run();

    res.status(201).json({
      id,
      name,
      provider,
      repoUrl,
      webhookSecret,
      webhookUrl: `/webhooks/${provider}/${id}`,
    });
  });

  // Delete project
  router.delete("/api/projects/:id", (req: Request, res: Response) => {
    const id = req.params.id as string;

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }

    db.delete(projects).where(eq(projects.id, id)).run();
    res.status(204).send();
  });

  // Generate API key for project
  router.post("/api/projects/:id/keys", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { label } = req.body || {};

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }

    const rawKey = `gpt_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyId = randomUUID();

    db.insert(apiKeys)
      .values({
        id: keyId,
        projectId: id,
        keyHash,
        keyRaw: rawKey,
        label: label || null,
        createdAt: Date.now(),
      })
      .run();

    res.status(201).json({
      id: keyId,
      key: rawKey,
      label: label || null,
    });
  });

  // Get recent logs (summaries) for a project
  router.get("/api/projects/:id/logs", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 3, 20);

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }

    const logs = db
      .select()
      .from(pushSummaries)
      .where(eq(pushSummaries.projectId, id))
      .orderBy(desc(pushSummaries.generatedAt))
      .limit(limit)
      .all();

    res.json(
      logs.map((l) => ({
        id: l.id,
        branch: l.branch,
        author: l.author,
        commitCount: l.commitCount,
        summary: l.summary,
        generatedAt: new Date(l.generatedAt).toISOString(),
      }))
    );
  });

  // Delete API key
  router.delete(
    "/api/projects/:projectId/keys/:keyId",
    (req: Request, res: Response) => {
      const keyId = req.params.keyId as string;

      const key = db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, keyId))
        .get();

      if (!key) {
        res.status(404).json({ error: "key not found" });
        return;
      }

      db.delete(apiKeys).where(eq(apiKeys.id, keyId)).run();

      res.status(204).send();
    }
  );

  return router;
}
