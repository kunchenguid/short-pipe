import { spawn } from "node:child_process";

export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Streamed stdout chunks, for surfacing progress to the UI. */
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly result: RunResult,
  ) {
    super(message);
    this.name = "ProcessError";
  }
}

/**
 * Run a one-shot subprocess to completion, capturing stdout/stderr. The child is
 * started in its own process group (detached) so an abort kills the whole tree -
 * important for ffmpeg/Chrome children spawned by hyperframes. Rejects with
 * ProcessError on a non-zero exit so callers can branch on success simply.
 */
export function runProcess(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      killTree(child.pid);
    };
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    child.on("error", (error) => {
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", onAbort);
      const result: RunResult = { code, stdout, stderr };
      if (aborted) {
        reject(new ProcessError(`${command} aborted`, result));
      } else if (code === 0) {
        resolve(result);
      } else {
        reject(
          new ProcessError(
            `${command} exited with code ${code}: ${stderr.trim() || stdout.trim()}`.slice(0, 2000),
            result,
          ),
        );
      }
    });
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"]);
    } else {
      // Negative pid targets the whole process group started by `detached: true`.
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Process already gone.
  }
}
