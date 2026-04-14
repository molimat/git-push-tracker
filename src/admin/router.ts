import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
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

  router.use(auth);

  // Serve admin UI
  router.get("/", (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, "ui", "index.html"));
  });

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
          label: k.label,
          createdAt: k.createdAt,
          revoked: k.revokedAt !== null,
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
        label: label || null,
        createdAt: Date.now(),
        revokedAt: null,
      })
      .run();

    res.status(201).json({
      id: keyId,
      key: rawKey,
      label: label || null,
      message:
        "Save this key now. It will not be shown again.",
    });
  });

  // Revoke API key
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

      db.update(apiKeys)
        .set({ revokedAt: Date.now() })
        .where(eq(apiKeys.id, keyId))
        .run();

      res.status(204).send();
    }
  );

  return router;
}
