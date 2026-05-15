import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
    },
  },
  renderer: {
    root: path.resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, "out/renderer"),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer/src"),
      },
    },
  },
});
