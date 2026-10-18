// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// What the app says about privacy, in Settings → Privacy (`PrivacyNote.tsx`)
// and — on the website — in the sidebar's About menu. DOM-free, so the tests
// can read it under node.
//
// The full policy covers every build (this device, a folder, Dropbox and
// iCloud Drive), so every build links to it. The short summary above the link
// is the build's own: the phone app offers neither Dropbox nor a folder
// (`store.ts`), so its sentence names only the device and iCloud Drive, and
// nothing that exists only outside the phone app.

/** The full privacy policy — the page the store listing points at too. */
export const PRIVACY_POLICY_URL = "https://apps.agilator.se/calc/privacy/";

/**
 * The short summary above the link. The build flag is tested here, where the
 * sentence is chosen, so each build's bundle carries only its own.
 */
export const PRIVACY_SUMMARY: string =
  import.meta.env.VITE_NATIVE_BUILD === "on"
    ? "Everything stays on this device or in your own iCloud Drive: your sessions go to iCloud Drive only if you choose it under Storage, and your settings never leave the device. The app sends nothing when it opens. There is nothing to sign up for, and there are no analytics, no ads and no AI."
    : "Everything stays on this device unless you connect storage under Storage — a folder you pick, or your own Dropbox, where the app sees only its own folder — and your settings never leave the device. There is nothing to sign up for, and there are no analytics, no ads and no AI.";
