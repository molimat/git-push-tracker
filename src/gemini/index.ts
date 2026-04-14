import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NormalizedPush } from "../webhooks/github.js";

export function createGeminiClient(apiKey: string, model: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const generativeModel = genAI.getGenerativeModel({ model });

  async function generateSummary(
    projectName: string,
    push: NormalizedPush
  ): Promise<string> {
    const commitsText = push.commits
      .map((c) => {
        const files = [...c.added, ...c.modified, ...c.removed];
        return `- ${c.message}\n  Files: ${files.join(", ") || "none"}`;
      })
      .join("\n");

    const prompt = `You received the following commits from a git push:

Repository: ${projectName}
Branch: ${push.branch}
Author: ${push.author}

Commits:
${commitsText}

Generate a concise summary in bullet points (max 5) describing the main changes in this push. Focus on functional impact, not technical details. Write in the same language as the commit messages.`;

    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  return { generateSummary };
}

export type GeminiClient = ReturnType<typeof createGeminiClient>;
