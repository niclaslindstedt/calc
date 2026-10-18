// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE A NAVIGATION IN THE WEBVIEW GOES.
//
// **Import-free**, so the root suite can test it without Expo installed
// (tests/native_navigation_test.ts).
//
// The WebView stays on the embedded app. Anything else — a link in a note,
// the privacy policy under Settings → Privacy — belongs in the system
// browser, because App Review expects external links to open externally. A
// `target="_blank"` link arrives here too: the WebView opens no second
// window, so it asks to load the URL in this one first.

/** What `App.tsx` does with a request: let the WebView load it, hand it to
 *  the system browser (and refuse it here), or refuse it outright. */
export type NavigationRoute = "load" | "browser" | "drop";

/**
 * @param url the URL the WebView is about to load
 * @param origin the loopback server's origin, or null before it is up
 */
export function routeNavigation(
  url: string,
  origin: string | null,
): NavigationRoute {
  if (!origin) return "drop";
  // A `blob:` or `data:` URL only exists inside this WebView, so the system
  // browser could not open it. Exports reach the share sheet through
  // `saveFile` instead; anything still navigating there is dropped.
  if (/^(blob|data):/i.test(url)) return "drop";
  if (url.startsWith(origin)) return "load";
  if (url.startsWith("about:")) return "load";
  return "browser";
}
