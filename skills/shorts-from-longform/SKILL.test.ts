import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const skillPath = join(dirname(fileURLToPath(import.meta.url)), "SKILL.md");

describe("shorts-from-longform skill defaults", () => {
  it("instructs the agent to omit user-defaulted visual fields", async () => {
    const skill = await readFile(skillPath, "utf8");

    expect(skill).toContain("Omit `layout`, `captionStyle`, and `theme` by default");
    expect(skill).toContain("When you omit them, Short Pipe applies the user's Settings defaults");
    expect(skill).toContain("`full` - the whole source frame, uncropped, at its real aspect ratio. The default");
    expect(skill).toContain("`dark` - ink page, warm off-white text; full-bleed captions are light on a dark scrim. The default");
    expect(skill).not.toContain("The default for talking-head audio-led content");
    expect(skill).not.toMatch(/`light`[^\n]*The default/);
    expect(skill).not.toMatch(/`top-square`[^\n]*The default/);
    expect(skill).not.toMatch(/`square`[^\n]*\(the default\)/);
  });
});
