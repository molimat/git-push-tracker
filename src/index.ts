import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";
import { createWebhookRouter } from "./webhooks/router.js";
import { createApiRouter } from "./api/router.js";
import { createAdminRouter } from "./admin/router.js";
import { createGeminiClient } from "./gemini/index.js";
import { startWorker } from "./worker/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const { db } = createDb(config.databasePath);
const gemini = createGeminiClient(config.geminiApiKey, config.geminiModel);

const app = express();
app.use(express.json());

// Serve static assets (logo, favicon, og-image)
app.use("/assets", express.static(join(__dirname, "admin", "ui", "assets")));

// Mount routers
app.use("/webhooks", createWebhookRouter(db));
app.use("/api/v1", createApiRouter(db));
app.use("/admin", createAdminRouter(db, config.adminUser, config.adminPass));

// Root redirects to admin
app.get("/", (_req, res) => {
  res.redirect("/admin");
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// Start worker
const worker = startWorker(
  db,
  gemini,
  config.workerIntervalMs,
  config.maxRetryAttempts
);

// Start server
app.listen(config.port, () => {
  console.log(`[server] Git Push Tracker running on port ${config.port}`);
  console.log(`[server] Admin UI: http://localhost:${config.port}/admin`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[server] Shutting down...");
  worker.stop();
  process.exit(0);
});
