const userAgent = process.env.npm_config_user_agent ?? "";
const execPath = process.env.npm_execpath ?? "";
const isPnpm = userAgent.includes("pnpm/") || execPath.includes("pnpm");

if (!isPnpm) {
  console.error("Short Pipe uses pnpm only. Run `pnpm install` instead.");
  process.exit(1);
}
