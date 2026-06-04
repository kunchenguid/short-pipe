import { describe, expect, it } from "vitest";
import { ProcessError, runProcess } from "./runProcess";

describe("runProcess", () => {
  it("captures stdout and resolves on a zero exit", async () => {
    const result = await runProcess("node", ["-e", "process.stdout.write('hello')"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("hello");
  });

  it("streams stdout chunks", async () => {
    const chunks: string[] = [];
    await runProcess("node", ["-e", "process.stdout.write('abc')"], {
      onStdout: (c) => chunks.push(c),
    });
    expect(chunks.join("")).toBe("abc");
  });

  it("rejects with ProcessError and stderr on a non-zero exit", async () => {
    await expect(
      runProcess("node", ["-e", "process.stderr.write('boom'); process.exit(2)"]),
    ).rejects.toMatchObject({ name: "ProcessError", result: { code: 2, stderr: "boom" } });
  });

  it("rejects when aborted and kills the process", async () => {
    const controller = new AbortController();
    const promise = runProcess("node", ["-e", "setTimeout(() => {}, 10000)"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(ProcessError);
  });

  it("rejects with the spawn error for a missing binary", async () => {
    await expect(runProcess("definitely-not-a-real-binary-xyz", [])).rejects.toBeTruthy();
  });
});
