import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import {
  createTestDb,
  createTestApp,
  TEST_ADMIN_USER,
  TEST_ADMIN_PASS,
} from "../helpers/setup.js";
import { basicAuthHeader, makeGitHubPayload, signGitHubPayload } from "../helpers/fixtures.js";
import { startWorker } from "../../src/worker/index.js";
import type { AppDb } from "../../src/db/index.js";
import type { GeminiClient } from "../../src/gemini/index.js";

let db: AppDb;
let cleanup: () => void;
let app: ReturnType<typeof createTestApp>;
const auth = basicAuthHeader(TEST_ADMIN_USER, TEST_ADMIN_PASS);

beforeAll(() => {
  ({ db, cleanup } = createTestDb());
  app = createTestApp(db);
});

afterAll(() => cleanup());

describe("full flow: create project → webhook → worker → query API", () => {
  it("processes a push end-to-end", async () => {
    // 1. Create project via admin API
    const createRes = await request(app)
      .post("/admin/api/projects")
      .set("Authorization", auth)
      .send({ name: "e2e-project", provider: "github", repoUrl: "https://github.com/o/r" });

    expect(createRes.status).toBe(201);
    const projectId = createRes.body.id;
    const webhookSecret = createRes.body.webhookSecret;

    // 2. Generate API key
    const keyRes = await request(app)
      .post(`/admin/api/projects/${projectId}/keys`)
      .set("Authorization", auth)
      .send({ label: "e2e-key" });

    expect(keyRes.status).toBe(201);
    const apiKey = keyRes.body.key;

    // 3. Send GitHub webhook
    const payload = makeGitHubPayload();
    const body = JSON.stringify(payload);
    const signature = signGitHubPayload(body, webhookSecret);

    const webhookRes = await request(app)
      .post(`/webhooks/github/${projectId}`)
      .set("x-github-event", "push")
      .set("x-hub-signature-256", signature)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(webhookRes.status).toBe(202);

    // 4. Worker processes the push (mock Gemini)
    const gemini: GeminiClient = {
      generateSummary: vi.fn().mockResolvedValue("E2E: Added login page and fixed empty state"),
    };

    const worker = startWorker(db, gemini, 999999, 3);
    await worker.processNow();
    worker.stop();

    expect(gemini.generateSummary).toHaveBeenCalledOnce();

    // 5. Query API with the generated key
    const apiRes = await request(app)
      .get("/api/v1/pushes")
      .set("Authorization", `Bearer ${apiKey}`);

    expect(apiRes.status).toBe(200);
    expect(apiRes.body.project).toBe("e2e-project");
    expect(apiRes.body.pushes).toHaveLength(1);
    expect(apiRes.body.pushes[0].summary).toBe("E2E: Added login page and fixed empty state");
    expect(apiRes.body.pushes[0].branch).toBe("main");
    expect(apiRes.body.pushes[0].author).toBe("testuser");
    expect(apiRes.body.pushes[0].commitCount).toBe(2);

    // 6. Verify admin logs also show the summary
    const logsRes = await request(app)
      .get(`/admin/api/projects/${projectId}/logs`)
      .set("Authorization", auth);

    expect(logsRes.status).toBe(200);
    expect(logsRes.body).toHaveLength(1);
    expect(logsRes.body[0].summary).toBe("E2E: Added login page and fixed empty state");
  });
});
