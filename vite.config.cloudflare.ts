// Standard build configuration for Cloudflare Workers.
// Used for independent Cloudflare builds.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Public Supabase configuration for browser builds.
const PUBLIC_SUPABASE_URL =
  process.env["VITE_SUPABASE_URL"] || "https://ciljxyxcqvbkiqppmamy.supabase.co";

const PUBLIC_SUPABASE_KEY =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpbGp4eXhjcXZia2lxcHBtYW15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTc1ODEsImV4cCI6MjEwNDg5MzU4MX0.9RB0Hb2AxqQO1CDGP233EDIpETHqIJBgbR44ERra8Ho";

const PUBLIC_SUPABASE_PROJECT_ID =
  process.env["VITE_SUPABASE_PROJECT_ID"] || "ciljxyxcqvbkiqppmamy";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(PUBLIC_SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(PUBLIC_SUPABASE_KEY),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(PUBLIC_SUPABASE_PROJECT_ID),
  },

  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },

  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({ server: { entry: "server" } }),
    nitro({
      preset: "cloudflare-module",
      cloudflare: { deployConfig: true, nodeCompat: true },
      plugins: ["./server/plugins/email-cron.ts"],
    }),
    viteReact(),
    tailwindcss(),
  ],
});
