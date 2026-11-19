import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev background worker (Phase 7). Tasks live in src/trigger/.
 * Set TRIGGER_PROJECT_REF (the "proj_…" ref from the Trigger.dev dashboard) before
 * `pnpm trigger:dev` or `pnpm trigger:deploy`. See docs/architecture/background-processing.md.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_set_TRIGGER_PROJECT_REF",
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 300,
  // The database owns submission retries (fail_application_attempt); tasks never retry on their own.
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  build: {
    // Lets worker code import modules marked `server-only`.
    conditions: ["react-server"],
  },
});
