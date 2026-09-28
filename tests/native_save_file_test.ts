// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The save-file bridge (`native/src/saveFileBridge.ts`) against the seam it
// fills (`saveFile` in oss-framework's files module).
//
// Like the other two bridges, every failure here is silent: a descriptor the
// framework does not read leaves the page downloading into a WebView that
// drops the download, and a result event under another name leaves the
// page's promise pending forever. So the two sides are pinned against each
// other, and the injected scripts are RUN against a stand-in for the
// WebView's window, with the framework's own `saveFile` on the page side.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MIME_CSV,
  SAVE_FILE_MESSAGE,
  SAVE_FILE_RESULT_EVENT,
  saveFile,
} from "@niclaslindstedt/oss-framework/files";
import { nativeShellCan } from "@niclaslindstedt/oss-framework/pwa";

import {
  SAVE_FILE_DESCRIPTOR,
  SAVE_FILE_RESULT_EVENT as BRIDGE_RESULT_EVENT,
  SAVE_FILE_TYPE,
  bareName,
  isSaveFileRequest,
  saveFileResultScript,
  type SaveFileRequest,
} from "../native/src/saveFileBridge.ts";

type FakeWindow = EventTarget & Record<string, unknown> & { posted: string[] };

/** The WebView's `window`: a real event target, with the bridge every
 *  `onMessage` WebView has, recording what the page posts out. */
function fakeWindow(): FakeWindow {
  const win = Object.assign(new EventTarget(), {
    posted: [] as string[],
  }) as FakeWindow;
  win.ReactNativeWebView = {
    postMessage: (data: string) => win.posted.push(data),
  };
  return win;
}

/** Run an injected script against `win`, the way the WebView would. */
function run(script: string, win: FakeWindow): void {
  new Function("window", "CustomEvent", script)(win, CustomEvent);
}

/** The next request the page posted, parsed. */
async function nextRequest(win: FakeWindow): Promise<SaveFileRequest> {
  await vi.waitFor(() => expect(win.posted).toHaveLength(1));
  const parsed: unknown = JSON.parse(win.posted.shift()!);
  if (!isSaveFileRequest(parsed)) throw new Error("not a save-file request");
  return parsed;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the contract's names", () => {
  it("are the framework's", () => {
    expect(SAVE_FILE_TYPE).toBe(SAVE_FILE_MESSAGE);
    expect(BRIDGE_RESULT_EVENT).toBe(SAVE_FILE_RESULT_EVENT);
  });
});

describe("the injected descriptor", () => {
  it("advertises save-file where the framework reads it", () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    expect(nativeShellCan("save-file")).toBe(false);
    run(SAVE_FILE_DESCRIPTOR, win);
    expect(win.__ossShell).toEqual({ version: 1, capabilities: ["save-file"] });
    expect(nativeShellCan("save-file")).toBe(true);
  });

  it("merges into a descriptor already there, and only once", () => {
    const win = fakeWindow();
    win.__ossShell = { version: 1, capabilities: ["other"] };
    run(SAVE_FILE_DESCRIPTOR, win);
    run(SAVE_FILE_DESCRIPTOR, win);
    expect(win.__ossShell).toEqual({
      version: 1,
      capabilities: ["other", "save-file"],
    });
  });
});

describe("an export in the phone app", () => {
  it("posts the file to the shell and resolves when the sheet closes", async () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    run(SAVE_FILE_DESCRIPTOR, win);

    const saving = saveFile({
      text: "a,b\r\n1,2",
      filename: "tape.csv",
      mimeType: MIME_CSV,
    });
    const request = await nextRequest(win);
    expect(request).toMatchObject({
      type: SAVE_FILE_TYPE,
      version: 1,
      filename: "tape.csv",
      mimeType: "text/csv",
    });
    expect(Buffer.from(request.base64, "base64").toString("utf8")).toBe(
      "a,b\r\n1,2",
    );

    run(saveFileResultScript(request.id, true), win);
    await expect(saving).resolves.toBe("shared");
  });

  it("rejects with the shell's error when the file could not be shared", async () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    run(SAVE_FILE_DESCRIPTOR, win);

    const saving = saveFile({ text: "x", filename: "x.txt" });
    const request = await nextRequest(win);
    run(saveFileResultScript(request.id, false, "No room."), win);
    await expect(saving).rejects.toThrow("No room.");
  });

  it("settles only the request it answers", async () => {
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    run(SAVE_FILE_DESCRIPTOR, win);

    let settled = false;
    const saving = saveFile({ text: "x", filename: "x.txt" }).then((r) => {
      settled = true;
      return r;
    });
    const request = await nextRequest(win);
    run(saveFileResultScript("someone-else", true), win);
    await Promise.resolve();
    expect(settled).toBe(false);
    run(saveFileResultScript(request.id, true), win);
    await expect(saving).resolves.toBe("shared");
  });
});

describe("an export in a browser", () => {
  it("still downloads when no shell advertises save-file", async () => {
    // The bridge alone (an older shell) is not enough: the page must not
    // post into a shell that has not implemented the contract.
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    const anchor = { click: vi.fn(), remove: vi.fn() } as Record<
      string,
      unknown
    >;
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { appendChild: vi.fn() },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    await expect(saveFile({ text: "x", filename: "x.txt" })).resolves.toBe(
      "downloaded",
    );
    expect(anchor.download).toBe("x.txt");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(win.posted).toEqual([]);
  });
});

describe("the name the shell writes", () => {
  it("is the last path component, never a path", () => {
    expect(bareName("../../etc/passwd")).toBe("passwd");
    expect(bareName("a\\b.csv")).toBe("b.csv");
    expect(bareName("..")).toBe("file");
    expect(bareName("  ")).toBe("file");
  });
});
