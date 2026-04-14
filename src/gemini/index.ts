import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NormalizedPush } from "../webhooks/github.js";

function loadPromptTemplate(): string {
  const promptPath = resolve(process.cwd(), "PROMPT.md");
  return readFileSync(promptPath, "utf-8");
}

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

    const template = loadPromptTemplate();
    const prompt = template
      .replace("{{projectName}}", projectName)
      .replace("{{branch}}", push.branch)
      .replace("{{author}}", push.author)
      .replace("{{commits}}", commitsText);

    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  return { generateSummary };
}

export type GeminiClient = ReturnType<typeof createGeminiClient>;
