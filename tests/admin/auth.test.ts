import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createBasicAuth } from "../../src/admin/auth.js";
import { basicAuthHeader } from "../helpers/fixtures.js";

function createAuthApp() {
  const app = express();
  app.use(createBasicAuth("admin", "pass123"));
  app.get("/test", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createBasicAuth", () => {
  const app = createAuthApp();

  it("allows correct credentials", async () => {
    const res = await request(app)
      .get("/test")
      .set("Authorization", basicAuthHeader("admin", "pass123"));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 401 without auth header", async () => {
    const res = await request(app).get("/test");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("authentication required");
  });

  it("returns 401 with wrong credentials", async () => {
    const res = await request(app)
      .get("/test")
      .set("Authorization", basicAuthHeader("admin", "wrong"));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid credentials");
  });

  it("returns 401 for non-Basic scheme", async () => {
    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer sometoken");

    expect(res.status).toBe(401);
  });

  it("does not include WWW-Authenticate header", async () => {
    const res = await request(app).get("/test");

    expect(res.headers["www-authenticate"]).toBeUndefined();
  });
});
