// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The phone build offers no Dropbox; the website and the desktop app offer it
// as before. `DROPBOX_OFFERED` is read once, when store.ts loads, so each case
// stubs the phone flag and loads the module fresh.

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadStore(nativeBuild: string) {
  vi.stubEnv("VITE_NATIVE_BUILD", nativeBuild);
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  });
  vi.resetModules();
  return import("../src/app/store.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Dropbox in the phone build", () => {
  it("is not offered", async () => {
    const store = await loadStore("on");
    expect(store.DROPBOX_OFFERED).toBe(false);
  });

  it("opens an install that chose Dropbox on this device", async () => {
    const store = await loadStore("on");
    store.writeBackendPreference("dropbox");
    expect(store.readBackendPreference()).toBeNull();
  });

  it("still reconnects the backends it does offer", async () => {
    const store = await loadStore("on");
    store.writeBackendPreference("icloud");
    expect(store.readBackendPreference()).toBe("icloud");
  });
});

describe("Dropbox on the website and in the desktop app", () => {
  it("is offered", async () => {
    const store = await loadStore("");
    expect(store.DROPBOX_OFFERED).toBe(true);
  });

  it("reconnects an install that chose it", async () => {
    const store = await loadStore("");
    store.writeBackendPreference("dropbox");
    expect(store.readBackendPreference()).toBe("dropbox");
  });
});
