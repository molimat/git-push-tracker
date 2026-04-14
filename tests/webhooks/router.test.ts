import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createTestDb, createTestApp, seedProject, type AppDb } from "../helpers/setup.js";
import { makeGitHubPayload, makeGitLabPayload, signGitHubPayload } from "../helpers/fixtures.js";
import { rawPushes } from "../../src/db/schema.js";

let db: AppDb;
let cleanup: () => void;
let app: ReturnType<typeof createTestApp>;

beforeAll(() => {
  ({ db, cleanup } = createTestDb());
  app = createTestApp(db);
});

afterAll(() => cleanup());

describe("GitHub webhook", () => {
  it("returns 202 and queues push with valid signature", async () => {
    const project = seedProject(db);
    const payload = makeGitHubPayload();
    const body = JSON.stringify(payload);
    const signature = signGitHubPayload(body, project.webhookSecret);

    const res = await request(app)
      .post(`/webhooks/github/${project.id}`)
      .set("x-github-event", "push")
      .set("x-hub-signature-256", signature)
      .set("Content-Type", "application/json")
      .send(payload);

    expect(res.status).toBe(202);

    const rows = db
      .select()
      .from(rawPushes)
      .where(eq(rawPushes.projectId, project.id))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0].branch).toBe("main");
    expect(rows[0].author).toBe("testuser");
    expect(rows[0].commitCount).toBe(2);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].provider).toBe("github");
  });

  it("returns 404 for unknown project", async () => {
    const payload = makeGitHubPayload();

    const res = await request(app)
      .post("/webhooks/github/nonexistent-id")
      .set("x-github-event", "push")
      .set("x-hub-signature-256", "sha256=fake")
      .send(payload);

    expect(res.status).toBe(404);
  });

  it("returns 401 for invalid signature", async () => {
    const project = seedProject(db);
    const payload = makeGitHubPayload();

    const res = await request(app)
      .post(`/webhooks/github/${project.id}`)
      .set("x-github-event", "push")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(payload);

    expect(res.status).toBe(401);
  });

  it("returns 200 for non-push events", async () => {
    const project = seedProject(db);

    const res = await request(app)
      .post(`/webhooks/github/${project.id}`)
      .set("x-github-event", "issues")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("ignored");
  });
});

describe("GitLab webhook", () => {
  it("returns 202 and queues push with valid token", async () => {
    const project = seedProject(db, { provider: "gitlab" });
    const payload = makeGitLabPayload();

    const res = await request(app)
      .post(`/webhooks/gitlab/${project.id}`)
      .set("x-gitlab-event", "Push Hook")
      .set("x-gitlab-token", project.webhookSecret)
      .send(payload);

    expect(res.status).toBe(202);

    const rows = db
      .select()
      .from(rawPushes)
      .where(eq(rawPushes.projectId, project.id))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0].branch).toBe("develop");
    expect(rows[0].author).toBe("gitlabuser");
    expect(rows[0].provider).toBe("gitlab");
  });

  it("returns 404 for unknown project", async () => {
    const res = await request(app)
      .post("/webhooks/gitlab/nonexistent-id")
      .set("x-gitlab-event", "Push Hook")
      .set("x-gitlab-token", "token")
      .send(makeGitLabPayload());

    expect(res.status).toBe(404);
  });

  it("returns 401 for invalid token", async () => {
    const project = seedProject(db, { provider: "gitlab" });

    const res = await request(app)
      .post(`/webhooks/gitlab/${project.id}`)
      .set("x-gitlab-event", "Push Hook")
      .set("x-gitlab-token", "wrong-token")
      .send(makeGitLabPayload());

    expect(res.status).toBe(401);
  });

  it("returns 200 for non-push events", async () => {
    const project = seedProject(db, { provider: "gitlab" });

    const res = await request(app)
      .post(`/webhooks/gitlab/${project.id}`)
      .set("x-gitlab-event", "Merge Request Hook")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("ignored");
  });
});
