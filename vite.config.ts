import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Offline-first app shell: everything Loam needs to boot is precached, so
    // it opens on a plane even when hosted remotely. Data already lives in
    // IndexedDB; this makes the *app itself* local too.
    VitePWA({
      // "prompt": a new deploy must never force-reload open tabs mid-keystroke;
      // main.tsx asks the user and reloads only on consent
      registerType: "prompt",
      includeAssets: ["loam.svg"],
      manifest: {
        name: "Loam — local-first knowledge base",
        short_name: "Loam",
        description: "A local-first knowledge base for compounding knowledge over time.",
        theme_color: "#F4F4F1",
        background_color: "#F4F4F1",
        display: "standalone",
        icons: [
          { src: "loam.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "loam.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache only what Loam needs to boot. The local-AI runtimes (WebLLM
        // ~6 MB + its worker, the embeddings worker, the 24 MB ONNX wasm) are
        // opt-in features — they runtime-cache on first use (below) instead of
        // costing every first visit ~12 MB.
        globPatterns: ["**/*.{js,css,html,svg,ico,webmanifest,woff2}"],
        globIgnores: ["**/llm.worker-*.js", "**/embeddings.worker-*.js", "**/web-llm-*.js"],
        navigateFallback: "index.html",
        runtimeCaching: [
          // Google Fonts split across two origins: cache the CSS and the woff2
          // so typography survives offline (first visit online required)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-woff",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // the ONNX runtime (~24 MB wasm + loader mjs) is too big to precache
          // on every visitor — cache it the first time the local AI is used,
          // so embeddings keep working offline afterwards. Transformers.js
          // loads it from jsdelivr at runtime; the /assets/ variant covers a
          // future self-hosted build.
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*onnxruntime-web.*\.(mjs|wasm)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "loam-wasm",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // …and this origin's own AI chunks excluded from the precache
            urlPattern: /\/assets\/(.*\.(mjs|wasm)|(llm\.worker|embeddings\.worker|web-llm)-.*\.js)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "loam-wasm-local",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // model weights (Transformers.js / WebLLM) manage their own caches;
          // API traffic (Cadence, Ollama) must never be cached — leave unmatched
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5189,
    open: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // named so the service worker can keep it out of the precache
          if (id.includes("@mlc-ai/web-llm")) return "web-llm";
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
          if (id.includes("react") || id.includes("dexie") || id.includes("zustand"))
            return "vendor";
        },
      },
    },
  },
});
