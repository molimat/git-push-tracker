import { describe, it, expect } from "vitest";
import {
  validateGitHubSignature,
  parseGitHubPush,
} from "../../src/webhooks/github.js";
import {
  validateGitLabToken,
  parseGitLabPush,
} from "../../src/webhooks/gitlab.js";
import { makeGitHubPayload, makeGitLabPayload, signGitHubPayload } from "../helpers/fixtures.js";

describe("validateGitHubSignature", () => {
  const secret = "test-secret";
  const payload = '{"test":true}';

  it("returns true for valid signature", () => {
    const sig = signGitHubPayload(payload, secret);
    expect(validateGitHubSignature(payload, sig, secret)).toBe(true);
  });

  it("returns false when signature is undefined", () => {
    expect(validateGitHubSignature(payload, undefined, secret)).toBe(false);
  });

  it("returns false for wrong signature", () => {
    expect(validateGitHubSignature(payload, "sha256=wrong", secret)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const sig = signGitHubPayload(payload, secret);
    expect(validateGitHubSignature(payload, sig, "other-secret")).toBe(false);
  });
});

describe("parseGitHubPush", () => {
  it("extracts branch, author, and commits", () => {
    const payload = makeGitHubPayload();
    const result = parseGitHubPush(payload);

    expect(result.branch).toBe("main");
    expect(result.author).toBe("testuser");
    expect(result.commitCount).toBe(2);
    expect(result.commits).toHaveLength(2);
    expect(result.commits[0]).toEqual({
      id: "abc123",
      message: "feat: add login page",
      author: "testuser",
      added: ["src/login.ts"],
      modified: [],
      removed: [],
    });
  });

  it("handles empty commits", () => {
    const payload = makeGitHubPayload({ commits: [] });
    const result = parseGitHubPush(payload);

    expect(result.commitCount).toBe(0);
    expect(result.commits).toEqual([]);
  });

  it("extracts branch from refs/heads/ prefix", () => {
    const payload = makeGitHubPayload({ ref: "refs/heads/feature/auth" });
    const result = parseGitHubPush(payload);
    expect(result.branch).toBe("feature/auth");
  });
});

describe("validateGitLabToken", () => {
  it("returns true when tokens match", () => {
    expect(validateGitLabToken("secret-token", "secret-token")).toBe(true);
  });

  it("returns false when token is undefined", () => {
    expect(validateGitLabToken(undefined, "secret-token")).toBe(false);
  });

  it("returns false when tokens differ", () => {
    expect(validateGitLabToken("wrong", "secret-token")).toBe(false);
  });
});

describe("parseGitLabPush", () => {
  it("extracts branch, author, and commits", () => {
    const payload = makeGitLabPayload();
    const result = parseGitLabPush(payload);

    expect(result.branch).toBe("develop");
    expect(result.author).toBe("gitlabuser");
    expect(result.commitCount).toBe(1);
    expect(result.commits[0]).toEqual({
      id: "aaa111",
      message: "chore: update deps",
      author: "gitlabuser",
      added: [],
      modified: ["package.json"],
      removed: [],
    });
  });

  it("handles empty commits", () => {
    const payload = makeGitLabPayload({ commits: [] });
    const result = parseGitLabPush(payload);

    expect(result.commitCount).toBe(0);
    expect(result.commits).toEqual([]);
  });
});
