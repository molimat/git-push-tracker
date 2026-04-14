import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/index.js";
import { apiKeys } from "../db/schema.js";

declare global {
  namespace Express {
    interface Request {
      projectId?: string;
    }
  }
}

export function createBearerAuth(db: AppDb) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing or invalid authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    const keyHash = createHash("sha256").update(token).digest("hex");

    const key = db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .get();

    if (!key) {
      res.status(401).json({ error: "invalid api key" });
      return;
    }

    req.projectId = key.projectId;
    next();
  };
}
