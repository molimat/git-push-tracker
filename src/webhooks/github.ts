import { createHmac, timingSafeEqual } from "node:crypto";

export interface NormalizedPush {
  branch: string;
  author: string;
  commitCount: number;
  commits: Array<{
    id: string;
    message: string;
    author: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

export function validateGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function parseGitHubPush(payload: Record<string, unknown>): NormalizedPush {
  const ref = payload.ref as string;
  const branch = ref.replace("refs/heads/", "");
  const pusher = payload.pusher as { name: string };
  const commits = (payload.commits as Array<Record<string, unknown>>) || [];

  return {
    branch,
    author: pusher.name,
    commitCount: commits.length,
    commits: commits.map((c) => ({
      id: c.id as string,
      message: c.message as string,
      author: (c.author as { name: string }).name,
      added: (c.added as string[]) || [],
      modified: (c.modified as string[]) || [],
      removed: (c.removed as string[]) || [],
    })),
  };
}
