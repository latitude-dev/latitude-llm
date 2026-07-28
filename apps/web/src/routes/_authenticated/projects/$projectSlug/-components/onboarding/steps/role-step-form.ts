import type { HeardAboutUs } from "@domain/users"

/**
 * Field contract for the "Tell us about yourself" onboarding step.
 *
 * Lives in its own module because two routes build this form independently —
 * the project onboarding flow (`onboarding-flow.tsx`) and the invite-claim flow
 * (`claim.$token.tsx`) — and both render the same `RoleStep.Left`. Keeping the
 * shape here means adding a field can't leave one of them behind.
 */
export type OnboardingFormValues = {
  jobTitle: string
  /** Dialling prefix chosen in the phone field; composed with the number on submit. */
  phoneCallingCode: string
  phoneNumber: string
  /** `""` until the user picks a channel, which is what the required check looks for. */
  heardAboutUs: HeardAboutUs | ""
  heardAboutUsOther: string
}

export const EMPTY_ONBOARDING_FORM_VALUES: OnboardingFormValues = {
  jobTitle: "",
  phoneCallingCode: "",
  phoneNumber: "",
  heardAboutUs: "",
  heardAboutUsOther: "",
}

/**
 * Fields that must pass validation before the step may advance. The step
 * submits on "Next" rather than through a native form, so each one has to be
 * validated by name — a field missing from this list would submit unchecked.
 *
 * `phoneNumber` is optional but still validated: its validator rejects a
 * malformed number for the selected calling code.
 */
export const ROLE_STEP_REQUIRED_FIELDS = ["jobTitle", "phoneNumber", "heardAboutUs"] as const
