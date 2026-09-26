// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { render } from "preact";

// Default UI family static so it precaches for offline first paint.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";
// The other families load on demand, but only once someone has told the
// framework where their bytes come from: it deliberately ships no
// `@fontsource/*` specifier of its own, so an app importing a single
// component is never made to resolve font packages it did not install. This
// import registers the loaders for the three families the presets name, from
// the `@fontsource/*` packages this app already depends on.
import "@niclaslindstedt/oss-framework/theme/fontsource";
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
const mount = root;

// `VITE_SEED=demo` boots onto the demo shelf instead of the reader's own
// sessions (see src/app/dev/demo.ts). A build-time switch: Vite folds the
// comparison, so a build without it carries neither the demo nor its data.
if (import.meta.env.VITE_SEED === "demo") {
  void import("./app/dev/demo.ts").then((demo) => {
    demo.installDemo();
    render(<App />, mount);
  });
} else {
  render(<App />, mount);
}
