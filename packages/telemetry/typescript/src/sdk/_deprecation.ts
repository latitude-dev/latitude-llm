/**
 * Internal helpers for one-time deprecation warnings.
 *
 * Lives in its own module so both `init.ts` and `context.ts` can depend on it
 * without forming a circular import (`init` already imports the span processor,
 * which imports `context`). Mirrors the Python `_deprecation.py` module.
 */

let projectSlugDeprecationWarned = false

/** @internal Exposed for test resets — not part of the public API. */
export function resetProjectSlugDeprecationWarningForTesting(): void {
  projectSlugDeprecationWarned = false
}

export function warnProjectSlugDeprecated(site: "constructor" | "capture"): void {
  if (projectSlugDeprecationWarned) return
  projectSlugDeprecationWarned = true
  const optionName = site === "constructor" ? "`projectSlug`" : "`projectSlug` on capture()"
  console.warn(
    `[Latitude] ${optionName} is deprecated and will be removed in a future release — rename it to \`project\`. ` +
      "Both work for now; when both are passed, `project` wins.",
  )
}
