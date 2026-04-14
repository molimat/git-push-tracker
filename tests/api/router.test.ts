import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  createTestDb,
  createTestApp,
  seedProject,
  seedApiKey,
  seedRawPush,
  seedPushSummary,
  type AppDb,
} from "../helpers/setup.js";

let db: AppDb;
let cleanup: () => void;
let app: ReturnType<typeof createTestApp>;

beforeAll(() => {
  ({ db, cleanup } = createTestDb());
  app = createTestApp(db);
});

afterAll(() => cleanup());

describe("GET /api/v1/pushes", () => {
  it("returns 401 without Bearer token", async () => {
    const res = await request(app).get("/api/v1/pushes");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid Bearer token", async () => {
    const res = await request(app)
      .get("/api/v1/pushes")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
  });

  it("returns pushes with valid Bearer token", async () => {
    const project = seedProject(db, { name: "api-test" });
    const key = seedApiKey(db, project.id);
    const rp = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp.id, {
      summary: "Added login feature",
      branch: "main",
      author: "testuser",
    });

    const res = await request(app)
      .get("/api/v1/pushes")
      .set("Authorization", `Bearer ${key.rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.project).toBe("api-test");
    expect(res.body.pushes).toHaveLength(1);
    expect(res.body.pushes[0].summary).toBe("Added login feature");
    expect(res.body.pushes[0].branch).toBe("main");
    expect(res.body.pushes[0].author).toBe("testuser");
    expect(res.body.pushes[0].id).toBeDefined();
    expect(res.body.pushes[0].pushedAt).toBeDefined();
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 1,
    });
  });

  it("respects limit and offset", async () => {
    const project = seedProject(db, { name: "pagination-test" });
    const key = seedApiKey(db, project.id);

    for (let i = 0; i < 5; i++) {
      const rp = seedRawPush(db, project.id);
      seedPushSummary(db, project.id, rp.id, { generatedAt: 1000 + i });
    }

    const res = await request(app)
      .get("/api/v1/pushes?limit=2&offset=1")
      .set("Authorization", `Bearer ${key.rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.pushes).toHaveLength(2);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.offset).toBe(1);
    expect(res.body.pagination.total).toBe(5);
  });

  it("caps limit at 100", async () => {
    const project = seedProject(db, { name: "limit-cap" });
    const key = seedApiKey(db, project.id);

    const res = await request(app)
      .get("/api/v1/pushes?limit=999")
      .set("Authorization", `Bearer ${key.rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it("filters by branch", async () => {
    const project = seedProject(db, { name: "branch-filter" });
    const key = seedApiKey(db, project.id);

    const rp1 = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp1.id, { branch: "main" });

    const rp2 = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp2.id, { branch: "develop" });

    const res = await request(app)
      .get("/api/v1/pushes?branch=main")
      .set("Authorization", `Bearer ${key.rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.pushes.every((p: { branch: string }) => p.branch === "main")).toBe(true);
    expect(res.body.pagination.total).toBe(1);
  });

  it("filters by since timestamp", async () => {
    const project = seedProject(db, { name: "since-filter" });
    const key = seedApiKey(db, project.id);

    const rp1 = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp1.id, { generatedAt: 1000 });

    const rp2 = seedRawPush(db, project.id);
    seedPushSummary(db, project.id, rp2.id, { generatedAt: Date.now() });

    const res = await request(app)
      .get(`/api/v1/pushes?since=${new Date(Date.now() - 60000).toISOString()}`)
      .set("Authorization", `Bearer ${key.rawKey}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });
});
