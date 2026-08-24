// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { render } from "preact";

// Default UI family static so it precaches for offline first paint; other
// families load on demand via the theme engine's loadFontFamily.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";
import "./styles.css";

import { App } from "./App.tsx";

// Dev: unregister any service worker left by a previous `vite preview` on
// this origin, so dev never serves stale precached assets.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((reg) => void reg.unregister()));
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

render(<App />, root);
