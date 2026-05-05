import { afterEach, beforeEach, vi } from "vitest"

/**
 * Silences `console.log / .warn / .error` for every test in the calling file.
 *
 * Production code paths route through `logger.info / .warn / .error`, which
 * write structured JSON lines to those console methods. Tests that intentionally
 * exercise such paths (e.g. asserting a thrown error that also logs) shouldn't
 * print those lines to the test runner — they bury the real test output.
 *
 * Call once at the top of a test file (outside any `describe`). Spies are
 * restored after every test, so other `vi.spyOn` usage in individual tests
 * still works.
 *
 * @example
 * ```ts
 * import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
 *
 * silenceLoggerInTests()
 *
 * describe("...", () => { ... })
 * ```
 */
export const silenceLoggerInTests = (): void => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
}
