// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { createLogStore } from "@niclaslindstedt/oss-framework/logging";

// A single in-app log buffer, built on the framework's logging module. The
// storage layer and the app shell write their diagnostics into it; the
// persisted (captured) buffer lives under the app's own localStorage key so
// two framework apps on one origin never share a log.
export const logStore = createLogStore({ logsKey: "calc:logs" });
logStore.setEnabled(true);
logStore.setCaptureEnabled(true);
