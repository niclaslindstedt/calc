// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// "Open sidebar with" is offered only where an edge swipe is free to take: the
// installed PWA and the phone app. The gate is the framework's
// `isStandaloneMobile()` (App.tsx reads it through `useStandaloneMobile()`),
// which since oss-framework 3.12.0 also recognizes the phone shell — by the
// `ReactNativeWebView` bridge any WebView with `onMessage` has, or by a
// `window.__ossShell` descriptor. These run it against a stand-in window.

import { afterEach, describe, expect, it, vi } from "vitest";

import { isStandaloneMobile } from "@niclaslindstedt/oss-framework/pwa";

import { sidebarOpenMode } from "../src/app/useAppSettings.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function stubDevice(win: Record<string, unknown>, standalone = false): void {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: standalone }),
    ...win,
  });
  vi.stubGlobal("navigator", { userAgent: IPHONE, maxTouchPoints: 5 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sidebar-open setting's gate", () => {
  it("opens in the phone shell, found by its ReactNativeWebView bridge", () => {
    stubDevice({ ReactNativeWebView: { postMessage: () => {} } });
    expect(isStandaloneMobile()).toBe(true);
  });

  it("opens in a shell that only declares itself in window.__ossShell", () => {
    stubDevice({ __ossShell: { version: 1, capabilities: [] } });
    expect(isStandaloneMobile()).toBe(true);
  });

  it("opens in the installed PWA", () => {
    stubDevice({}, true);
    expect(isStandaloneMobile()).toBe(true);
  });

  it("stays shut in a phone's browser tab", () => {
    stubDevice({});
    expect(isStandaloneMobile()).toBe(false);
  });
});

describe("sidebarOpenMode", () => {
  it("honors the stored choice where the setting is offered", () => {
    expect(sidebarOpenMode("swipe", true)).toBe("swipe");
    expect(sidebarOpenMode("button", true)).toBe("button");
  });

  it("keeps the floating button in a browser tab, whatever was stored", () => {
    expect(sidebarOpenMode("swipe", false)).toBe("button");
    expect(sidebarOpenMode("button", false)).toBe("button");
  });
});
