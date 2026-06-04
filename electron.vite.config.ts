import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
    // Bake the Umami telemetry target into release builds. These are empty in
    // source/dev (and CI without the repo variable set), which keeps the
    // telemetry client a no-op so the app never phones home outside packaged
    // releases. See src/main/telemetry.ts.
    define: {
      "process.env.SHORT_PIPE_BUILD_UMAMI_HOST": JSON.stringify(
        process.env.SHORT_PIPE_UMAMI_HOST || "",
      ),
      "process.env.SHORT_PIPE_BUILD_UMAMI_WEBSITE_ID": JSON.stringify(
        process.env.SHORT_PIPE_UMAMI_WEBSITE_ID || "",
      ),
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    // Pin a dedicated dev port so Short Pipe never collides with sibling
    // electron-vite apps: hi-bit/openbud use Vite's default 5173, baby-menu
    // pins 5273. strictPort makes any future clash fail loudly instead of
    // silently loading the wrong app's renderer (electron-vite points the
    // Electron window at the configured port, not the actual fallback one).
    server: {
      port: 5373,
      strictPort: true,
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
        "@design": resolve(__dirname, "design"),
      },
    },
    plugins: [react()],
  },
});
