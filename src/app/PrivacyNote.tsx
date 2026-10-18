// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Settings → Privacy: the build's own short summary (`privacy.ts`) and a link
// to the full policy. The link opens outside the app in every build — a new
// tab on the website, and the system browser in the desktop and phone apps,
// whose shells send every off-origin navigation there — and tapping it is the
// only way this reaches the network.

import { ExternalLinkIcon } from "@niclaslindstedt/oss-framework/components";

import { PRIVACY_POLICY_URL, PRIVACY_SUMMARY } from "./privacy.ts";

export function PrivacyNote() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm leading-snug text-fg">{PRIVACY_SUMMARY}</p>
      <a
        href={PRIVACY_POLICY_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 self-start text-sm text-accent underline-offset-2 hover:underline"
      >
        Read the full privacy policy
        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
      </a>
    </div>
  );
}
