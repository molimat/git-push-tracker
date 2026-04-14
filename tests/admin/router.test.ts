import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  createTestApp,
  seedProject,
  seedApiKey,
  seedRawPush,
  seedPushSummary,
  TEST_ADMIN_USER,
  TEST_ADMIN_PASS,
  type AppDb,
} from "../helpers/setup.js";
import { basicAuthHeader } from "../helpers/fixtures.js";
import { apiKeys, rawPushes, pushSummaries } from "../../src/db/schema.js";

let db: AppDb;
let cleanup: () => void;
let app: ReturnType<typeof createTestApp>;
const auth = basicAuthHeader(TEST_ADMIN_USER, TEST_ADMIN_PASS);

beforeAll(() => {
  ({ db, cleanup } = createTestDb());
  app = createTestApp(db);
});

afterAll(() => cleanup());

describe("admin auth", () => {
  it("returns 401 without auth on API routes", async () => {
    const res = await request(app).get("/admin/api/projects");
    expect(res.status).toBe(401);
  });
});

describe("POST /admin/api/projects", () => {
  it("creates project with valid input", async () => {
    const res = await request(app)
      .post("/admin/api/projects")
      .set("Authorization", auth)
      .send({ name: "my-app", provider: "github", repoUrl: "https://github.com/o/r" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.webhookSecret).toBeDefined();
    expect(res.body.webhookUrl).toBe(`/webhooks/github/${res.body.id}`);
    expect(res.body.name).toBe("my-app");
  });

  it("returns 400 when name missing", async () => {
    const res = await request(app)
      .post("/admin/api/projects")
      .set("Authorization", auth)
      .send({ provider: "github", repoUrl: "https://github.com/o/r" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid provider", async () => {
    const res = await request(app)
      .post("/admin/api/projects")
      .set("Authorization", auth)
      .send({ name: "x", provider: "bitbucket", repoUrl: "https://bb.org/r" });

    expect(res.status).toBe(400);
  });
});

describe("GET /admin/api/projects", () => {
  it("returns projects with keys and stats", async () => {
    const project = seedProject(db, { name: "list-test" });
    seedApiKey(db, project.id);
    const rp = seedRawPush(db, project.id, { status: "pending" });
    seedPushSummary(db, project.id, rp.id);

    const res = await request(app)
      .get("/admin/api/projects")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    const found = res.body.find((p: { id: string }) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found.keys).toHaveLength(1);
    expect(found.stats.pending).toBe(1);
    expect(found.stats.processed).toBe(1);
  });
});

describe("DELETE /admin/api/projects/:id", () => {
  it("deletes existing project", async () => {
    const project = seedProject(db, { name: "to-delete" });

    const res = await request(app)
      .delete(`/admin/api/projects/${project.id}`)
      .set("Authorization", auth);

    expect(res.status).toBe(204);
  });

  it("returns 404 for unknown project", async () => {
    const res = await request(app)
      .delete("/admin/api/projects/nonexistent")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });

  it("cascade deletes keys, pushes, and summaries", async () => {
    const project = seedProject(db, { name: "cascade-test" });
    seedApiKey(db, project.id);
    const rp = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp.id);

    await request(app)
      .delete(`/admin/api/projects/${project.id}`)
      .set("Authorization", auth);

    const keys = db.select().from(apiKeys).where(eq(apiKeys.projectId, project.id)).all();
    const pushes = db.select().from(rawPushes).where(eq(rawPushes.projectId, project.id)).all();
    const summaries = db.select().from(pushSummaries).where(eq(pushSummaries.projectId, project.id)).all();

    expect(keys).toHaveLength(0);
    expect(pushes).toHaveLength(0);
    expect(summaries).toHaveLength(0);
  });
});

describe("POST /admin/api/projects/:id/keys", () => {
  it("generates API key with gpt_ prefix", async () => {
    const project = seedProject(db, { name: "key-test" });

    const res = await request(app)
      .post(`/admin/api/projects/${project.id}/keys`)
      .set("Authorization", auth)
      .send({ label: "production" });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^gpt_/);
    expect(res.body.id).toBeDefined();
    expect(res.body.label).toBe("production");
  });

  it("returns 404 for unknown project", async () => {
    const res = await request(app)
      .post("/admin/api/projects/nonexistent/keys")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(404);
  });
});

describe("DELETE /admin/api/projects/:projectId/keys/:keyId", () => {
  it("deletes existing key", async () => {
    const project = seedProject(db);
    const key = seedApiKey(db, project.id);

    const res = await request(app)
      .delete(`/admin/api/projects/${project.id}/keys/${key.id}`)
      .set("Authorization", auth);

    expect(res.status).toBe(204);
  });

  it("returns 404 for unknown key", async () => {
    const project = seedProject(db);

    const res = await request(app)
      .delete(`/admin/api/projects/${project.id}/keys/nonexistent`)
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });
});

describe("GET /admin/api/projects/:id/logs", () => {
  it("returns summaries ordered by generatedAt desc", async () => {
    const project = seedProject(db, { name: "logs-test" });
    const rp1 = seedRawPush(db, project.id);
    const rp2 = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp1.id, { generatedAt: 1000 });
    seedPushSummary(db, project.id, rp2.id, { generatedAt: 2000 });

    const res = await request(app)
      .get(`/admin/api/projects/${project.id}/logs`)
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Most recent first
    expect(new Date(res.body[0].generatedAt).getTime()).toBeGreaterThan(
      new Date(res.body[1].generatedAt).getTime()
    );
  });

  it("respects limit parameter", async () => {
    const project = seedProject(db, { name: "logs-limit" });
    for (let i = 0; i < 5; i++) {
      const rp = seedRawPush(db, project.id);
      seedPushSummary(db, project.id, rp.id);
    }

    const res = await request(app)
      .get(`/admin/api/projects/${project.id}/logs?limit=2`)
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns 404 for unknown project", async () => {
    const res = await request(app)
      .get("/admin/api/projects/nonexistent/logs")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });
});
