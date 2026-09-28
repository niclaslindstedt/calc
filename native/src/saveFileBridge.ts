// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SAVE-FILE BRIDGE: how an export leaves the app.
//
// A browser export is a download — an anchor clicked at a `blob:` URL. Inside
// the WebView that click goes nowhere: the WebView offers the `blob:` URL to
// the shell as a navigation, and nothing on the phone can open it. The
// framework's `saveFile` (`@niclaslindstedt/oss-framework/files`) is the
// export call that works in both places: in a shell that advertises the
// `save-file` capability it posts the file's bytes here instead, and this
// wrapper writes them to the cache and opens the share sheet
// (`saveFile.ts`). The contract is the framework's, in its
// `docs/native-shell.md`; this is its reference native half.
//
// As with the iCloud and sign-in providers, the page is told of a CAPABILITY,
// never of this wrapper: `window.__ossShell.capabilities` gains "save-file",
// and a page that finds none keeps downloading.
//
// Same shape as `authSessionBridge.ts`: this file holds the injected string
// and the pure narrowing and settling helpers, and it is exercised from the
// root test suite, so it imports nothing that reaches `expo`.

/** The page's request. The FRAMEWORK's name (`SAVE_FILE_MESSAGE`). */
export const SAVE_FILE_TYPE = "oss-framework/save-file";

/** The event that settles the page's promise (`SAVE_FILE_RESULT_EVENT`). */
export const SAVE_FILE_RESULT_EVENT = "oss-framework/save-file-result";

/** Injected before the page loads (beside the other before-load script), so
 *  the capability is there by the time the app first asks. Merges into a
 *  descriptor another contract may already have set. */
export const SAVE_FILE_DESCRIPTOR = `(function () {
  var shell = window.__ossShell || { version: 1, capabilities: [] };
  if (shell.capabilities.indexOf("save-file") < 0) shell.capabilities.push("save-file");
  window.__ossShell = shell;
})(); true;`;

export type SaveFileRequest = {
  type: string;
  version: number;
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
};

export function isSaveFileRequest(value: unknown): value is SaveFileRequest {
  const m = value as Partial<SaveFileRequest> | null;
  return (
    typeof m === "object" &&
    m !== null &&
    m.type === SAVE_FILE_TYPE &&
    typeof m.id === "string" &&
    typeof m.filename === "string" &&
    typeof m.mimeType === "string" &&
    typeof m.base64 === "string"
  );
}

/** iOS picks share targets by UTI, not MIME type. Extend as exports need. */
export const UTI: Record<string, string> = {
  "application/json": "public.json",
  "application/pdf": "com.adobe.pdf",
  "application/zip": "public.zip-archive",
  "image/jpeg": "public.jpeg",
  "image/png": "public.png",
  "image/svg+xml": "public.svg-image",
  "text/calendar": "public.calendar-event",
  "text/csv": "public.comma-separated-values-text",
  "text/markdown": "net.daringfireball.markdown",
  "text/plain": "public.plain-text",
  "text/vcard": "public.vcard",
};

/** Never trust the page's name: its last path component, or `file`. */
export function bareName(name: string): string {
  const last = name.split(/[\\/]/).pop()?.trim() ?? "";
  return last === "" || last === "." || last === ".." ? "file" : last;
}

/** The script that settles the page's promise. */
export function saveFileResultScript(
  id: string,
  ok: boolean,
  error?: string,
): string {
  const detail = ok ? { id, ok } : { id, ok, error };
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(
    SAVE_FILE_RESULT_EVENT,
  )}, { detail: ${JSON.stringify(detail)} })); true;`;
}
