import { HEARD_ABOUT_US_OTHER, type HeardAboutUs } from "@domain/users"

type OnboardingFormValues = {
  jobTitle: string
  /** Dialling prefix chosen in the phone field; composed with the number on submit. */
  phoneCallingCode: string
  phoneNumber: string
  /** `""` until the user picks a channel, which is what the required check looks for. */
  heardAboutUs: HeardAboutUs | ""
  /** Only collected when the choice is "Other"; submitted in place of the sentinel. */
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
 * Fields that must pass validation before the step may advance. The step submits
 * on "Next" rather than through a native form, so each one has to be validated
 * by name — a field missing from this list would submit unchecked.
 *
 * `phoneNumber` is optional but still validated: its validator rejects a
 * malformed number for the selected calling code.
 *
 * The free-text source only counts while "Other" is the choice; including it
 * unconditionally would block the step whenever a normal channel is picked.
 */
export const requiredRoleStepFields = (values: OnboardingFormValues) =>
  values.heardAboutUs === HEARD_ABOUT_US_OTHER
    ? (["jobTitle", "phoneNumber", "heardAboutUs", "heardAboutUsOther"] as const)
    : (["jobTitle", "phoneNumber", "heardAboutUs"] as const)

/**
 * Collapses the select and its free-text companion into the single value we
 * persist: a channel slug, or — for "Other" — whatever the user typed. The
 * `other` sentinel itself is never stored. Returns `""` when the form is not yet
 * answered, which callers treat as "don't submit".
 */
export const resolveHeardAboutUs = (values: OnboardingFormValues): string =>
  values.heardAboutUs === HEARD_ABOUT_US_OTHER ? values.heardAboutUsOther.trim() : values.heardAboutUs
