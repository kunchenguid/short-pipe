#!/usr/bin/env bash
# Assert every pull_request workflow excludes the config-derived release-please
# output set, so release PRs create zero CI runs instead of action_required ones.
#
# Derives the expected paths from release-please-config.json (release-type,
# changelog-path, version-file, extra-files) plus the manifest path, then checks
# each workflow's pull_request.paths-ignore (or negated paths entries) is a
# superset. Dependency-free: ruby + stdlib only.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

ruby -ryaml -rjson -e '
  config = JSON.parse(File.read("release-please-config.json"))
  packages = config.fetch("packages")

  expected = []
  packages.each do |pkg_path, pkg|
    pkg = {} unless pkg.is_a?(Hash)
    release_type = pkg["release-type"] || config["release-type"] || "node"
    changelog = pkg["changelog-path"] || config["changelog-path"] || "CHANGELOG.md"
    prefix = pkg_path == "." ? "" : pkg_path.sub(%r{/*\z}, "/")

    expected << "#{prefix}#{changelog}"
    case release_type
    when "simple"
      version_file = pkg["version-file"] || config["version-file"] || "version.txt"
      expected << "#{prefix}#{version_file}"
    when "node"
      expected << "#{prefix}package.json"
      lock = "#{prefix}package-lock.json"
      expected << lock if File.exist?(lock)
    when "go"
      # changelog only by default
    else
      abort "unsupported release-please release-type for ignore derivation: #{release_type}"
    end

    extra = pkg["extra-files"] || []
    extra.each do |entry|
      path = entry.is_a?(Hash) ? entry["path"] : entry
      next if path.nil? || path.to_s.empty?
      expected << (pkg_path == "." ? path.to_s : "#{prefix}#{path}")
    end
  end

  root_extra = config["extra-files"] || []
  root_extra.each do |entry|
    path = entry.is_a?(Hash) ? entry["path"] : entry
    expected << path.to_s if path && !path.to_s.empty?
  end

  manifest = ".release-please-manifest.json"
  Dir.glob(".github/workflows/*.{yml,yaml}").each do |wf_path|
    text = File.read(wf_path)
    text.scan(/manifest-file:\s*(\S+)/) { |m| manifest = m[0] }
  end
  expected << manifest
  expected = expected.map(&:to_s).uniq.sort

  pr_workflows = []
  Dir.glob(".github/workflows/*.{yml,yaml}").sort.each do |wf_path|
    wf = YAML.load_file(wf_path)
    on = wf[true] || wf["on"]
    next unless on.is_a?(Hash) && on.key?("pull_request")
    pr_workflows << [wf_path, on["pull_request"]]
  end

  if pr_workflows.empty?
    abort "no pull_request workflows found under .github/workflows/"
  end

  failures = []
  pr_workflows.each do |wf_path, pr|
    covered = []
    case pr
    when nil, true, Array
      # bare pull_request: or list form - no path filter
      covered = []
    when Hash
      if pr.key?("paths") && pr.key?("paths-ignore")
        failures << "#{wf_path}: pull_request must not combine paths with paths-ignore"
        next
      end
      if pr.key?("paths-ignore")
        ignore = Array(pr["paths-ignore"]).map(&:to_s)
        covered = ignore
      elsif pr.key?("paths")
        # Negated entries (!path) after positives exclude those paths.
        covered = Array(pr["paths"]).map(&:to_s).select { |p| p.start_with?("!") }.map { |p| p.delete_prefix("!") }
      end
    else
      failures << "#{wf_path}: pull_request trigger has unexpected shape: #{pr.inspect}"
      next
    end

    missing = expected.reject { |path| covered.include?(path) }
    unless missing.empty?
      failures << "#{wf_path}: pull_request path filter missing release-please outputs: #{missing.join(", ")} (expected #{expected.join(", ")}; have #{covered.join(", ")})"
    end
  end

  if failures.empty?
    puts "release-please CI exclusions ok (#{expected.join(", ")}) across #{pr_workflows.map(&:first).join(", ")}"
    exit 0
  end

  failures.each { |f| warn f }
  exit 1
'
