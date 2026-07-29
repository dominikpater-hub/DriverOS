import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Capacitor bierze zbudowaną apkę z tego katalogu
  build: {
    outDir: "dist",
  },
  // ścieżki względne — konieczne, by apka działała z file:// w WebView
  base: "./",
});
