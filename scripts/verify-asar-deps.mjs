#!/usr/bin/env node
// Build-time guard against electron-builder's pnpm dependency-collector dropping
// transitive node_modules from the packaged asar.
//
// electron-builder@26 builds its copy list from `pnpm list --prod --json`, which
// dedups repeated subtrees. When a package (e.g. `minimatch`, pulled in by
// @earendil-works/pi-coding-agent) appears more than once in the tree, the
// collector records the first - childless - occurrence and skips the later one
// that actually lists the children, so the children (e.g. `brace-expansion` ->
// `balanced-match`) never get copied. The released app then crashes at startup
// with `ERR_MODULE_NOT_FOUND: Cannot find package 'brace-expansion'`.
//
// This script walks every package.json shipped inside the asar and asserts that
// each declared (non-optional) dependency is resolvable from inside the asar via
// normal node_modules resolution. It catches the brace-expansion regression and
// any other dropped transitive, and is meant to run right after electron-builder
// so a broken bundle fails the build instead of shipping.
//
// Usage: node scripts/verify-asar-deps.mjs <path-to-app.asar | path-to .app | dist-dir>

import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import asar from "@electron/asar";

function fail(msg) {
  console.error(`\n[verify-asar-deps] ${msg}\n`);
  process.exit(1);
}

// Resolve the asar path from whatever the caller passed (the archive itself, a
// .app bundle, or a dist output dir containing one).
function resolveAsar(input) {
  if (!input) fail("missing argument: path to app.asar, .app bundle, or dist dir");
  if (existsSync(input) && statSync(input).isFile() && input.endsWith(".asar")) {
    return input;
  }
  const candidates = [];
  if (input.endsWith(".app")) {
    candidates.push(join(input, "Contents", "Resources", "app.asar"));
  }
  // dist dir: scan for any mac*/<Product>.app/Contents/Resources/app.asar
  if (existsSync(input) && statSync(input).isDirectory()) {
    for (const sub of readdirSync(input)) {
      const macDir = join(input, sub);
      if (!statSync(macDir).isDirectory()) continue;
      for (const entry of readdirSync(macDir)) {
        if (entry.endsWith(".app")) {
          candidates.push(join(macDir, entry, "Contents", "Resources", "app.asar"));
        }
      }
    }
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    fail(`could not locate app.asar from "${input}" (looked at: ${candidates.join(", ") || "none"})`);
  }
  return found;
}

const asarPath = resolveAsar(process.argv[2]);
console.log(`[verify-asar-deps] checking ${asarPath}`);

const entries = asar.listPackage(asarPath, { isPack: false });
// Normalize to POSIX-style absolute-in-archive paths.
const files = new Set(entries.map((e) => e.replace(/\\/g, "/")));

// All shipped package.json files under node_modules.
const pkgJsons = entries
  .map((e) => e.replace(/\\/g, "/"))
  .filter((p) => p.startsWith("/node_modules/") && p.endsWith("/package.json"))
  // Only top-level package.json per package dir, not nested dist/package.json etc.
  // A package dir is .../node_modules/<name>[/...]/package.json with no further
  // "/node_modules/" -> handled by the resolution walk; keep the directory's own.
  .filter((p) => {
    const dir = p.slice(0, -"/package.json".length);
    // package dir must be an immediate child of a node_modules (handles @scope)
    return /\/node_modules\/(@[^/]+\/[^/]+|[^/]+)$/.test(dir);
  });

// Does node_modules resolution find `dep` starting from package dir `fromDir`?
// Walk up: <fromDir>/node_modules/<dep>, then each ancestor's node_modules.
function resolvable(fromDir, dep) {
  let dir = fromDir;
  while (true) {
    const candidate = `${dir}/node_modules/${dep}/package.json`;
    if (files.has(candidate)) return true;
    const idx = dir.lastIndexOf("/node_modules/");
    if (idx === -1) {
      // Reached the asar root's node_modules level; final check at root.
      const rootCandidate = `/node_modules/${dep}/package.json`;
      return files.has(rootCandidate);
    }
    // Step up to the parent that owns this node_modules.
    dir = dir.slice(0, idx);
  }
}

const missing = [];
for (const pkgJsonPath of pkgJsons) {
  const pkgDir = pkgJsonPath.slice(0, -"/package.json".length);
  let pkg;
  try {
    pkg = JSON.parse(asar.extractFile(asarPath, pkgJsonPath.replace(/^\//, "")).toString("utf8"));
  } catch {
    continue;
  }
  // Only hard dependencies. Optional deps are allowed to be absent.
  const deps = pkg.dependencies || {};
  const optional = pkg.optionalDependencies || {};
  for (const dep of Object.keys(deps)) {
    if (optional[dep]) continue;
    if (!resolvable(pkgDir, dep)) {
      missing.push({ pkg: `${pkg.name || pkgDir}`, dep, from: pkgDir });
    }
  }
}

if (missing.length > 0) {
  console.error(`\n[verify-asar-deps] FAIL: ${missing.length} dependency(ies) missing from the asar:`);
  for (const m of missing) {
    console.error(`  - "${m.dep}" required by ${m.pkg} (${m.from}) is not resolvable inside the asar`);
  }
  fail(
    "The packaged app is missing runtime dependencies and would crash with ERR_MODULE_NOT_FOUND.\n" +
      "This is electron-builder's pnpm collector dropping a deduped transitive. Add the missing\n" +
      "package(s) as direct dependencies in package.json so the collector visits them at top level.",
  );
}

console.log(`[verify-asar-deps] OK: ${pkgJsons.length} packages checked, all dependencies resolvable.`);
