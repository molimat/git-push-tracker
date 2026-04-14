import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Set required vars
    process.env.GEMINI_API_KEY = "test-key";
    process.env.ADMIN_USER = "admin";
    process.env.ADMIN_PASS = "pass";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns correct values with all env vars set", () => {
    process.env.PORT = "4000";
    process.env.DATABASE_PATH = "/tmp/test.db";
    process.env.WORKER_INTERVAL_MS = "5000";
    process.env.MAX_RETRY_ATTEMPTS = "5";
    process.env.GEMINI_MODEL = "gemini-pro";

    const config = loadConfig();

    expect(config.geminiApiKey).toBe("test-key");
    expect(config.adminUser).toBe("admin");
    expect(config.adminPass).toBe("pass");
    expect(config.port).toBe(4000);
    expect(config.databasePath).toBe("/tmp/test.db");
    expect(config.workerIntervalMs).toBe(5000);
    expect(config.maxRetryAttempts).toBe(5);
    expect(config.geminiModel).toBe("gemini-pro");
  });

  it("uses defaults for optional vars", () => {
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.databasePath).toBe("./data/pushlog.db");
    expect(config.workerIntervalMs).toBe(10000);
    expect(config.maxRetryAttempts).toBe(3);
    expect(config.geminiModel).toBe("gemini-2.5-flash-lite");
  });

  it("throws when GEMINI_API_KEY missing", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => loadConfig()).toThrow("GEMINI_API_KEY");
  });

  it("throws when ADMIN_USER missing", () => {
    delete process.env.ADMIN_USER;
    expect(() => loadConfig()).toThrow("ADMIN_USER");
  });

  it("throws when ADMIN_PASS missing", () => {
    delete process.env.ADMIN_PASS;
    expect(() => loadConfig()).toThrow("ADMIN_PASS");
  });
});
