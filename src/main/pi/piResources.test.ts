import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt, createAgentResourceLoader } from "./piResources";

describe("buildAgentSystemPrompt", () => {
  it("describes the single-session shorts workflow and its tools", () => {
    const prompt = buildAgentSystemPrompt();
    expect(prompt).toContain("Short Pipe agent");
    expect(prompt).toContain("shorts-from-longform skill");
    expect(prompt).toContain("propose_candidates");
    expect(prompt).toContain("1080x1920");
  });

  it("only renders approved candidates", () => {
    expect(buildAgentSystemPrompt()).toMatch(/not render anything the user has not approved/i);
  });
});

describe("createAgentResourceLoader", () => {
  it("exposes no skills when no skillsDir is given", () => {
    expect(createAgentResourceLoader().getSkills()).toEqual({ skills: [], diagnostics: [] });
  });

  it("uses the agent system prompt", () => {
    expect(createAgentResourceLoader().getSystemPrompt()).toContain("Short Pipe agent");
  });

  it("loads the bundled shorts-from-longform skill from the skills dir", () => {
    const loader = createAgentResourceLoader(undefined, { skillsDir: resolve("skills") });
    const skill = loader.getSkills().skills.find((s) => s.name === "shorts-from-longform");
    expect(skill).toBeDefined();
    expect(skill?.description).toMatch(/shorts|soundbite|vertical/i);
  });
});
