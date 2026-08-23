#!/usr/bin/env ruby
require "json"
require "open3"
require "tempfile"
require "yaml"

ROOT = Dir.pwd
BASE = "63334e6fd6d0fdba8ba99f021d2d8c249aa2525f"
PIN = "32d396ac0f29135daf7fcb9964aba9d5f4e796d6"
ACTION = "kunchenguid/no-mistakes/.github/actions/require-no-mistakes@#{PIN}"
EVIDENCE = "/Users/kunchen/.no-mistakes/evidence/01M0P4RR1ZAVRB6TC2JWC3MREM"
VERIFY = File.join(EVIDENCE, "verify.py")
WORKFLOW = File.join(ROOT, ".github/workflows/no-mistakes-required.yml")


def assert(condition, message)
  raise message unless condition
end

def load_workflow(text)
  YAML.safe_load(text, aliases: true)
end

current = load_workflow(File.read(WORKFLOW))
base_text, status = Open3.capture2("git", "show", "#{BASE}:.github/workflows/no-mistakes-required.yml")
assert(status.success?, "could not load baseline workflow")
baseline = load_workflow(base_text)

# YAML 1.1 names the unquoted `on` key true. Normalize only the two intended
# behavioral changes, then compare the complete machine-consumed model.
current_trigger = current.fetch(true).fetch("pull_request")
baseline_trigger = baseline.fetch(true).fetch("pull_request")
assert(current_trigger.fetch("types") == %w[opened edited reopened], "unexpected trigger set")
assert(baseline_trigger.fetch("types") == %w[opened edited synchronize reopened], "unexpected baseline trigger set")
current_steps = current.fetch("jobs").fetch("check").fetch("steps")
assert(current_steps == [{"name" => "Verify no-mistakes signature and pipeline attestation in PR body", "uses" => ACTION}], "workflow is not a thin pinned caller")

normalized_current = Marshal.load(Marshal.dump(current))
normalized_baseline = Marshal.load(Marshal.dump(baseline))
normalized_current.fetch(true).fetch("pull_request")["types"] = normalized_baseline.fetch(true).fetch("pull_request").fetch("types")
normalized_current.fetch("jobs").fetch("check")["steps"] = normalized_baseline.fetch("jobs").fetch("check").fetch("steps")
assert(normalized_current == normalized_baseline, "workflow semantics changed outside trigger types and enforcement steps")
assert(!current.fetch(true).key?("pull_request_target"), "unsafe pull_request_target boundary")
assert(current.fetch("permissions") == {"contents" => "read"}, "permissions are not read-only")
assert(current.fetch("jobs").fetch("check").fetch("name") == "PR must be raised via no-mistakes", "required check name changed")
assert(current_steps.none? { |step| step["uses"].to_s.start_with?("actions/checkout") }, "fork code is checked out")
assert(!current_steps.first.key?("with"), "exemptions were moved into action inputs")
shared_action = YAML.safe_load(File.read(File.join(EVIDENCE, "action.yml")), aliases: true)
action_runs = shared_action.fetch("runs")
assert(action_runs.fetch("using") == "composite", "pinned dependency is not a composite action")
assert(action_runs.fetch("steps").length == 1, "pinned action has an unexpected execution shape")
action_step = action_runs.fetch("steps").first
assert(action_step.fetch("shell") == "bash" && action_step.fetch("run").include?('"${GITHUB_ACTION_PATH}/verify.py"'), "pinned action does not execute its verifier")
puts "PASS workflow model: only trigger types and enforcement steps changed; check name, job-level exemptions, filters, permissions, concurrency, and pull_request fork boundary are preserved"
puts "PASS caller pin and executable contract: #{ACTION} invokes verify.py"

marker = "Updates from [git push no-mistakes](https://github.com/kunchenguid/no-mistakes)"

def invoke_verifier(label, body:, head:, expected_status:, expected_text:)
  event = {
    "pull_request" => {
      "number" => 42,
      "body" => body,
      "head" => {"sha" => head, "ref" => "feature/shared-action"},
      "user" => {"login" => "contributor"}
    }
  }
  event_path = File.join(EVIDENCE, "event.json")
  output_path = File.join(EVIDENCE, "github-output.txt")
  File.write(event_path, JSON.generate(event))
  File.write(output_path, "")
  env = {
    "GITHUB_EVENT_PATH" => event_path,
    "GITHUB_OUTPUT" => output_path,
    "PR_BODY" => "", "PR_HEAD_SHA" => "", "PR_HEAD_REF" => "", "PR_AUTHOR" => "", "PR_NUMBER" => "",
    "NM_EXEMPT_AUTHORS" => "", "NM_EXEMPT_BOT_AUTHORS" => "false", "NM_EXEMPT_HEAD_BRANCHES" => ""
  }
  stdout, stderr, status = Open3.capture3(env, "python3", VERIFY)
  combined = stdout + stderr
  assert(status.exitstatus == expected_status, "#{label}: exit #{status.exitstatus}, expected #{expected_status}\n#{combined}")
  assert(combined.include?(expected_text), "#{label}: expected output not observed\n#{combined}")
  outputs = File.read(output_path)
  expected_output = expected_status.zero? ? "compliant=true" : "compliant=false"
  assert(outputs.include?(expected_output), "#{label}: missing #{expected_output} output")
  puts "PASS #{label}: exit=#{status.exitstatus}; #{expected_text}"
ensure
  File.delete(event_path) if event_path && File.exist?(event_path)
  File.delete(output_path) if output_path && File.exist?(output_path)
end

head = "abc123"
last_wins_steps = [
  {"step" => "review", "status" => "failed"},
  {"step" => "review", "status" => "completed", "skipped" => true},
  {"step" => "test", "status" => "completed", "skip_reason" => "ignored sibling"},
  {"step" => "document", "status" => "completed"}
]
body = "#{marker}\n<!-- no-mistakes-pipeline-attestation:v1 #{JSON.generate({"head_sha" => head, "steps" => last_wins_steps})} -->"
invoke_verifier("compliant event payload with intended last-wins and ignored skip-shaped siblings", body: body, head: head, expected_status: 0, expected_text: "Found structurally compliant pipeline step attestation.")
invoke_verifier("stale head is rejected", body: body, head: "new-head", expected_status: 1, expected_text: "head_sha does not match the current PR head")

incomplete = [{"step" => "review", "status" => "completed"}, {"step" => "test", "status" => "failed"}, {"step" => "document", "status" => "completed"}]
incomplete_body = "#{marker}\n<!-- no-mistakes-pipeline-attestation:v1 #{JSON.generate({"head_sha" => head, "steps" => incomplete})} -->"
invoke_verifier("incomplete pipeline is rejected", body: incomplete_body, head: head, expected_status: 1, expected_text: "test (status=failed)")
invoke_verifier("unsigned PR is rejected", body: "ordinary pull request", head: head, expected_status: 1, expected_text: "This PR was not raised through no-mistakes")
