import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDb } from "../db/index.js";
import { projects, rawPushes } from "../db/schema.js";
import { validateGitHubSignature, parseGitHubPush } from "./github.js";
import { validateGitLabToken, parseGitLabPush } from "./gitlab.js";

export function createWebhookRouter(db: AppDb) {
  const router = Router();

  // GitHub webhook
  router.post("/github/:projectId", async (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const event = req.headers["x-github-event"];

    if (event !== "push") {
      res.status(200).json({ message: "ignored, not a push event" });
      return;
    }

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }

    const rawBody = JSON.stringify(req.body);
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    if (!validateGitHubSignature(rawBody, signature, project.webhookSecret)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const push = parseGitHubPush(req.body);

    db.insert(rawPushes)
      .values({
        id: randomUUID(),
        projectId,
        provider: "github",
        payload: rawBody,
        branch: push.branch,
        author: push.author,
        commitCount: push.commitCount,
        status: "pending",
        attempts: 0,
        receivedAt: Date.now(),
      })
      .run();

    res.status(202).json({ message: "push queued for processing" });
  });

  // GitLab webhook
  router.post("/gitlab/:projectId", async (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const event = req.headers["x-gitlab-event"];

    if (event !== "Push Hook") {
      res.status(200).json({ message: "ignored, not a push event" });
      return;
    }

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }

    const token = req.headers["x-gitlab-token"] as string | undefined;

    if (!validateGitLabToken(token, project.webhookSecret)) {
      res.status(401).json({ error: "invalid token" });
      return;
    }

    const push = parseGitLabPush(req.body);
    const rawBody = JSON.stringify(req.body);

    db.insert(rawPushes)
      .values({
        id: randomUUID(),
        projectId,
        provider: "gitlab",
        payload: rawBody,
        branch: push.branch,
        author: push.author,
        commitCount: push.commitCount,
        status: "pending",
        attempts: 0,
        receivedAt: Date.now(),
      })
      .run();

    res.status(202).json({ message: "push queued for processing" });
  });

  return router;
}
