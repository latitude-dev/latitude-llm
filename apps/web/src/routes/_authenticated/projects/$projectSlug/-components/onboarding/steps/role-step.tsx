import { HEARD_ABOUT_US_MAX_LENGTH, HEARD_ABOUT_US_OPTIONS, HEARD_ABOUT_US_OTHER } from "@domain/users"
import { Button, Input, Select, Text } from "@repo/ui"
import { PhoneNumberField } from "../../../../../../../components/phone-number-field.tsx"
import { fieldErrorsAsStrings } from "../../../../../../../lib/form-server-action.ts"
import { phoneNumberError, phoneNumberSubmitError } from "../../../../../../../lib/phone-countries.ts"
import type { OnboardingForm } from "../../onboarding-flow.tsx"

export function Left({
  form,
  isSubmitting,
  onNext,
}: {
  readonly form: OnboardingForm
  readonly isSubmitting: boolean
  readonly onNext: () => void
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8">
            <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">Tell us about yourself</Text.H2>
            <Text.H4 color="foregroundMuted">This helps us tailor Latitude to how you'll use it.</Text.H4>
          </div>
        </div>
        <form.Field
          name="jobTitle"
          validators={{
            onChange: ({ value }) => (value.trim() === "" ? "Please enter your job title" : undefined),
          }}
        >
          {(field) => (
            <Input
              type="text"
              label="Job title"
              placeholder="e.g. Software Architect, Fractional CMO, ML Engineer"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
              maxLength={256}
              autoComplete="organization-title"
            />
          )}
        </form.Field>
        <form.Field
          name="heardAboutUs"
          validators={{
            onChange: ({ value }) => (value === "" ? "Please let us know how you found us" : undefined),
          }}
        >
          {(field) => (
            <Select
              name="heardAboutUs"
              label="How did you hear about us?"
              placeholder="Select an option"
              options={HEARD_ABOUT_US_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              value={field.state.value || undefined}
              onChange={(value) => {
                field.handleChange(value)
                // Drop anything already typed when the answer is no longer "Other",
                // so switching back later can't submit a stale source the user has
                // stopped looking at.
                if (value !== HEARD_ABOUT_US_OTHER) form.setFieldValue("heardAboutUsOther", "")
              }}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.heardAboutUs}>
          {(heardAboutUs) =>
            heardAboutUs === HEARD_ABOUT_US_OTHER ? (
              <form.Field
                name="heardAboutUsOther"
                validators={{
                  onChange: ({ value }) =>
                    value.trim() === "" ? "Please tell us where you heard about us" : undefined,
                }}
              >
                {(field) => (
                  <Input
                    type="text"
                    label="Where did you hear about us?"
                    placeholder="e.g. a conference, a newsletter, a friend's blog"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    maxLength={HEARD_ABOUT_US_MAX_LENGTH}
                  />
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
        <form.Field name="phoneCallingCode">
          {(callingCodeField) => (
            <form.Field
              name="phoneNumber"
              validators={{
                onChange: ({ value }) => phoneNumberError(value, form.getFieldValue("phoneCallingCode")),
                onSubmit: ({ value }) => phoneNumberSubmitError(value, form.getFieldValue("phoneCallingCode")),
              }}
            >
              {(numberField) => (
                <PhoneNumberField
                  label="Phone number (optional)"
                  description="Helpful if we need to reach you about your setup."
                  callingCode={callingCodeField.state.value}
                  nationalNumber={numberField.state.value}
                  errors={fieldErrorsAsStrings(numberField.state.meta.errors)}
                  onCallingCodeChange={(callingCode) => {
                    callingCodeField.handleChange(callingCode)
                    void form.validateField("phoneNumber", "change")
                  }}
                  onNationalNumberChange={(value) => numberField.handleChange(value)}
                />
              )}
            </form.Field>
          )}
        </form.Field>
        <div>
          <Button disabled={isSubmitting} onClick={onNext}>
            {isSubmitting ? "Saving…" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}
