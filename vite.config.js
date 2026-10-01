import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  build: {
    outDir: path.resolve(projectRoot, "dist"),
  },
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/socket.io": {
        target: "http://localhost:8787",
        ws: true,
      },
    },
  },
});
