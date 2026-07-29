import { z } from "zod"

/**
 * Choices offered by the "How did you hear about us?" question on the
 * project-onboarding form.
 *
 * These are the *select* values, not the stored ones. `other` is a UI sentinel
 * that reveals a required free-text input — what the user types is persisted in
 * its place, so `other` itself is never written to the database. See
 * `User.heardAboutUs`.
 *
 * The seven real channels are stable slugs rather than the display labels so
 * marketing can keep re-wording the options without breaking historical
 * segments. Add new slugs at the end; never repurpose an existing one.
 */
const heardAboutUsSchema = z.enum(["recommendation", "search", "ai", "reddit", "github", "social", "video", "other"])
export type HeardAboutUs = z.infer<typeof heardAboutUsSchema>

/**
 * Options in the exact order they are presented in the onboarding select.
 * Shared so the form and any backoffice reporting label a slug the same way.
 */
export const HEARD_ABOUT_US_OPTIONS: readonly { readonly value: HeardAboutUs; readonly label: string }[] = [
  { value: "recommendation", label: "Recommended by someone" },
  { value: "search", label: "Google or search" },
  { value: "ai", label: "ChatGPT or other AI" },
  { value: "reddit", label: "Reddit" },
  { value: "github", label: "GitHub" },
  { value: "social", label: "X or LinkedIn" },
  { value: "video", label: "YouTube or podcast" },
  { value: "other", label: "Other" },
]

/** Sentinel option that swaps the select for a required free-text source. */
export const HEARD_ABOUT_US_OTHER = "other" satisfies HeardAboutUs

/** Ceiling for the stored value, matching the column and Loops' limits. */
export const HEARD_ABOUT_US_MAX_LENGTH = 256
