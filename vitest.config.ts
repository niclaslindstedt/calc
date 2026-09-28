import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-logic tests over the domain modules (evaluator, codec, session);
    // no DOM needed. Test files take the `_test` suffix.
    environment: "node",
    include: ["tests/**/*_test.ts"],
  },
});
