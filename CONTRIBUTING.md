# Contributing

Thanks for wanting to contribute.
One rule up front:

**Human-authored pull requests targeting `main` must be raised through [`no-mistakes`](https://github.com/kunchenguid/no-mistakes).**

`no-mistakes` puts a local git proxy in front of your real remote.
Pushing through it runs an AI-driven review, test, lint, and CI pipeline in an isolated worktree, forwards the push upstream only after every check passes, and opens a clean PR automatically.

A GitHub Actions check named `Require no-mistakes` runs on PRs targeting `main` and fails if the body is missing the deterministic signature that no-mistakes writes.
Known automation accounts are exempt so dependency and release automation can keep working.
Regular contributor PRs without the signature will not be reviewed or merged.

## Workflow

1. Fork the repo and clone your fork.
2. Create a branch and make your changes.
3. Initialize the gate in the repo once: `no-mistakes init`.
4. Commit your changes.
5. Push through the gate instead of pushing to `origin`: `git push no-mistakes`.
6. Run `no-mistakes` to attach to the pipeline, watch findings, and auto-fix or review as needed.
7. Once the pipeline passes, it forwards the push upstream and opens the PR for you.

See the [no-mistakes quick start](https://kunchenguid.github.io/no-mistakes/start-here/quick-start/) for the full first-run walkthrough.

## Repo Conventions

- Use `pnpm` with the pinned version from `packageManager`. The repo refuses other package managers via `scripts/ensure-pnpm.mjs`.
- Use TDD for bug fixes and new features.
- Tests live next to the code they cover as `*.test.ts` files (for example `src/main/auth/codexAuth.test.ts`).
- Run `pnpm check` (Biome lint + format), `pnpm typecheck`, `pnpm test`, and `pnpm build` before pushing.
- Run `pnpm package:mac` when changing packaging, runtime paths, native dependencies, or release behavior; it runs `pnpm verify:asar` before signing so missing packaged runtime dependencies fail locally.
- Local `pnpm package:mac` builds intentionally produce `Short Pipe Dev.app` with bundle id `com.shortpipe.app.dev`; release automation uses `electron-builder.yml` directly for the production `Short Pipe.app` identity.
- Keep universal macOS packaging compatible with both Intel and Apple Silicon Macs, including pnpm `supportedArchitectures` and electron-builder `x64ArchFiles` when adding prebuilt native packages.
- Keep `pnpm-lock.yaml` changes with dependency changes.
- Do not commit generated build output (`out/`, `dist/`) or release artifacts.
- Do not hand-edit release-please metadata such as `CHANGELOG.md` or `.release-please-manifest.json`.
- The on-device pipeline needs FFmpeg (`ffmpeg` and `ffprobe`) and the HyperFrames CLI on `PATH`; the app surfaces their readiness on the connect screen and in Settings, and the README has the install commands.

## Release Notes

Short Pipe releases are proposed by release-please after conventional commits land on `main`.
Use prefixes such as `feat:` and `fix:` so release-please can choose the version bump and release notes.
Mark breaking changes with `!` in the commit type or a `BREAKING CHANGE:` footer.
Merging the release-please PR creates the version tag and GitHub Release.
The release-please workflow then builds the universal macOS DMG, verifies the packaged asar dependencies, uploads the DMG, and updates `kunchenguid/homebrew-tap` with the release SHA so `brew upgrade --cask short-pipe` picks it up.
Maintainers must keep `HOMEBREW_TAP_TOKEN` configured with write access to `kunchenguid/homebrew-tap` for that update step.
Maintainers must also keep the `SHORT_PIPE_UMAMI_WEBSITE_ID` GitHub Actions repository variable configured for packaged-release telemetry; it is intentionally a variable rather than a secret because the id is baked into the app and sent in Umami payloads.
Do not manually rewrite the tap from this repo outside that workflow unless you are repairing a failed release.

## Questions

Open an issue if something is unclear.
