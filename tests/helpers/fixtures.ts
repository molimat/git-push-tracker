import { createHmac } from "node:crypto";

export function makeGitHubPayload(overrides?: Record<string, unknown>) {
  return {
    ref: "refs/heads/main",
    pusher: { name: "testuser" },
    commits: [
      {
        id: "abc123",
        message: "feat: add login page",
        author: { name: "testuser" },
        added: ["src/login.ts"],
        modified: [],
        removed: [],
      },
      {
        id: "def456",
        message: "fix: handle empty state",
        author: { name: "testuser" },
        added: [],
        modified: ["src/app.ts"],
        removed: ["src/old.ts"],
      },
    ],
    ...overrides,
  };
}

export function makeGitLabPayload(overrides?: Record<string, unknown>) {
  return {
    ref: "refs/heads/develop",
    user_name: "gitlabuser",
    commits: [
      {
        id: "aaa111",
        message: "chore: update deps",
        author: { name: "gitlabuser" },
        added: [],
        modified: ["package.json"],
        removed: [],
      },
    ],
    ...overrides,
  };
}

export function signGitHubPayload(body: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hmac}`;
}

export function basicAuthHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}
