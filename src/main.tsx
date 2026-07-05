import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./styles/global.css";
import { App } from "./App";

// Offline app shell: precached by the service worker so Loam boots with no
// network (plane mode), even when served from a remote host. New versions
// wait for consent — a deploy must never force-reload a tab mid-thought.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm("A new version of Loam is ready. Reload to update?"))
      void updateSW(true);
  },
});

// Ask the browser to protect IndexedDB from storage-pressure eviction — the
// vault is the single copy of the user's knowledge.
if (navigator.storage?.persist) void navigator.storage.persist();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
