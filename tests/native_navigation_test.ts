// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the phone app's WebView sends a link (`native/src/navigation.ts`).
//
// The privacy policy under Settings → Privacy, like every other off-origin
// link, has to leave the WebView for the system browser: loaded inside it, it
// would replace the app with a page that has no way back.

import { describe, expect, it } from "vitest";

import { routeNavigation } from "../native/src/navigation.ts";
import { PRIVACY_POLICY_URL } from "../src/app/privacy.ts";

const ORIGIN = "http://localhost:8261";

describe("a navigation in the phone app's WebView", () => {
  it("sends the privacy policy to the system browser", () => {
    expect(routeNavigation(PRIVACY_POLICY_URL, ORIGIN)).toBe("browser");
  });

  it("sends any other http(s) page there too", () => {
    expect(routeNavigation("https://example.com/a?b#c", ORIGIN)).toBe(
      "browser",
    );
    expect(routeNavigation("http://example.com/", ORIGIN)).toBe("browser");
  });

  it("keeps the embedded app in the WebView", () => {
    expect(routeNavigation(`${ORIGIN}/`, ORIGIN)).toBe("load");
    expect(routeNavigation(`${ORIGIN}/assets/index.js`, ORIGIN)).toBe("load");
    expect(routeNavigation("about:blank", ORIGIN)).toBe("load");
  });

  it("drops what only exists inside the WebView", () => {
    expect(routeNavigation("blob:http://localhost:8261/x", ORIGIN)).toBe(
      "drop",
    );
    expect(routeNavigation("data:text/plain,hi", ORIGIN)).toBe("drop");
  });

  it("drops everything before the local server is up", () => {
    expect(routeNavigation(PRIVACY_POLICY_URL, null)).toBe("drop");
  });
});
