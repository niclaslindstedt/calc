// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The phone build offers no Dropbox and no local folder — its WebView has no
// directory picker — and its "Device" segment speaks of the app's storage,
// not a browser's; the website and the desktop app offer both as before.
// The build constants are read once, when store.ts loads, so each case stubs
// the phone flag and loads the module fresh.

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

describe("Settings → Storage in the phone build", () => {
  it("lists the device and iCloud, and nothing else", async () => {
    const store = await loadStore("on");
    expect(store.FOLDER_OFFERED).toBe(false);
    expect(store.FOLDER_BACKEND_AVAILABLE).toBe(false);
    expect(store.STORAGE_CHOICES).toEqual([
      { value: "none", label: "Device" },
      { value: "icloud", label: "iCloud" },
    ]);
  });

  it("speaks of the app's storage, not a browser's", async () => {
    const store = await loadStore("on");
    expect(store.DEVICE_STORAGE).toEqual({
      where: "the app’s own storage",
      lostWith: "deleting the app",
    });
  });

  it("opens an install that chose a folder on this device", async () => {
    const store = await loadStore("on");
    store.writeBackendPreference("folder");
    expect(store.readBackendPreference()).toBeNull();
  });
});

describe("Settings → Storage on the website and in the desktop app", () => {
  it("lists every backend, the folder included", async () => {
    const store = await loadStore("");
    expect(store.FOLDER_OFFERED).toBe(true);
    expect(store.STORAGE_CHOICES.map((c) => c.label)).toEqual([
      "Device",
      "Folder",
      "Dropbox",
      "iCloud",
    ]);
    expect(store.DEVICE_STORAGE.where).toBe("this browser’s own storage");
  });

  it("reconnects an install that chose a folder", async () => {
    const store = await loadStore("");
    store.writeBackendPreference("folder");
    expect(store.readBackendPreference()).toBe("folder");
  });
});
