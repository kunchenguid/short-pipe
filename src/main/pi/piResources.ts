import {
  createExtensionRuntime,
  loadSkillsFromDir,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";

/**
 * The Short Pipe agent's system prompt. A single session operates over one video
 * project folder, turning the long-form source into ranked, captioned vertical
 * shorts. It leans on the bundled `shorts-from-longform` skill for the editorial
 * judgement (what makes a good soundbite, which layout and caption style to use).
 */
export function buildAgentSystemPrompt(): string {
  return `You are the Short Pipe agent.
You work inside a single video project folder, turning a long-form video into captioned vertical shorts (1080x1920).
Everything runs locally on the user's machine; nothing leaves it except your own model calls.

Read and follow the shorts-from-longform skill before proposing shorts. It defines how to pick soundbites, rank them, choose a layout (top-square, center-square, or full-bleed), pick a caption style, and choose keywords to emphasize.

Your tools:
- probe: read the source video's duration, resolution, and fps. Run it first if you do not yet know the source dimensions.
- transcribe: run local Whisper on the source to produce transcript.json (word-level timestamps). Run it once; skip if a transcript already exists.
- read, ls, grep, find: inspect the project folder, especially transcript.json, to understand the content.
- propose_candidates: submit your ranked list of soundbite candidates. Each references a word-id range from the transcript. This is how shorts reach the user's review queue, so propose only genuinely strong moments, ranked best first.
- render_short: render one approved candidate to a 1080x1920 clip. Only render candidates the user has approved.

A typical flow: probe, transcribe (if needed), read transcript.json, then propose_candidates with a tight ranked list. Do not invent timings - every candidate's word range must come from the real transcript. Do not render anything the user has not approved.

Keep replies short and concrete. When you finish proposing, tell the user how many candidates you added and invite them to review.`;
}

export type ResourceLoaderOptions = {
  /**
   * Directory of bundled skills (each a `<name>/SKILL.md`). When set, the loader
   * exposes them to the agent via the Agent Skills mechanism.
   */
  skillsDir?: string;
};

export function createResourceLoader(
  systemPrompt: string,
  options: ResourceLoaderOptions = {},
): ResourceLoader {
  const loader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () =>
      options.skillsDir
        ? loadSkillsFromDir({ dir: options.skillsDir, source: "user" })
        : { skills: [], diagnostics: [] },
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  return loader;
}

export function createAgentResourceLoader(
  systemPrompt = buildAgentSystemPrompt(),
  options: ResourceLoaderOptions = {},
): ResourceLoader {
  return createResourceLoader(systemPrompt, options);
}

/** Built-in file tools the agent is allowed to use, alongside the custom video tools. */
export const AGENT_FILE_TOOLS = ["read", "grep", "find", "ls"] as const;
