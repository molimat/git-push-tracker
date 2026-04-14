import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateContent = vi.fn();

// Mock the external Google AI module
vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return { generateContent: mockGenerateContent };
      }
    },
  };
});

// Import after mock
import { createGeminiClient } from "../../src/gemini/index.js";

describe("createGeminiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates summary with prompt template variables replaced", async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => "AI generated summary" },
    });

    const client = createGeminiClient("fake-key", "gemini-pro");
    const result = await client.generateSummary("my-project", {
      branch: "main",
      author: "alice",
      commitCount: 1,
      commits: [
        {
          id: "abc",
          message: "feat: new feature",
          author: "alice",
          added: ["src/new.ts"],
          modified: [],
          removed: [],
        },
      ],
    });

    expect(result).toBe("AI generated summary");

    const calledPrompt = mockGenerateContent.mock.calls[0][0] as string;
    expect(calledPrompt).toContain("my-project");
    expect(calledPrompt).toContain("main");
    expect(calledPrompt).toContain("alice");
    expect(calledPrompt).toContain("feat: new feature");
    expect(calledPrompt).toContain("src/new.ts");
    // Should not contain raw template variables
    expect(calledPrompt).not.toContain("{{projectName}}");
    expect(calledPrompt).not.toContain("{{branch}}");
    expect(calledPrompt).not.toContain("{{author}}");
    expect(calledPrompt).not.toContain("{{commits}}");
  });

  it("propagates Gemini API errors", async () => {
    mockGenerateContent.mockRejectedValue(new Error("API rate limit"));

    const client = createGeminiClient("fake-key", "gemini-pro");

    await expect(
      client.generateSummary("proj", {
        branch: "main",
        author: "bob",
        commitCount: 0,
        commits: [],
      })
    ).rejects.toThrow("API rate limit");
  });
});
