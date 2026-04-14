import type { NormalizedPush } from "./github.js";

export function validateGitLabToken(
  token: string | undefined,
  secret: string
): boolean {
  if (!token) return false;
  return token === secret;
}

export function parseGitLabPush(payload: Record<string, unknown>): NormalizedPush {
  const ref = payload.ref as string;
  const branch = ref.replace("refs/heads/", "");
  const userName = payload.user_name as string;
  const commits = (payload.commits as Array<Record<string, unknown>>) || [];

  return {
    branch,
    author: userName,
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
