import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const skillPath = join(dirname(fileURLToPath(import.meta.url)), "SKILL.md");

describe("shorts-from-longform skill defaults", () => {
  it("instructs the agent to use current visual defaults", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("The default for talking-head audio-led content");
    expect(skill).toContain("`center-square`");
    expect(skill).toContain("`full` - the whole source frame, uncropped, at its real aspect ratio. The default");
    expect(skill).toContain("`dark` - ink page, warm off-white text; full-bleed captions are light on a dark scrim. The default");
    expect(skill).not.toMatch(/`light`[^\n]*The default/);
    expect(skill).not.toMatch(/`top-square`[^\n]*The default/);
    expect(skill).not.toMatch(/`square`[^\n]*\(the default\)/);
  });
});
