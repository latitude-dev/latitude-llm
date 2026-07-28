import { z } from "zod"

/**
 * Attribution channel captured by the "How did you hear about us?" question on
 * the project-onboarding form.
 *
 * Stored as stable slugs rather than the display labels so marketing can keep
 * re-wording the options without breaking historical segments. Add new slugs at
 * the end; never repurpose an existing one.
 */
export const heardAboutUsSchema = z.enum([
  "recommendation",
  "search",
  "ai",
  "reddit",
  "github",
  "social",
  "video",
  "other",
])
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

/** Slug that unlocks the optional free-text "tell us more" input. */
export const HEARD_ABOUT_US_OTHER = "other" satisfies HeardAboutUs

/** Ceiling for the free-text source, matching the column and Loops' limits. */
export const HEARD_ABOUT_US_OTHER_MAX_LENGTH = 256
