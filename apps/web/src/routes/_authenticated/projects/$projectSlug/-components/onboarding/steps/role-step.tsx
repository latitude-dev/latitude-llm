import { Button, Input, Text } from "@repo/ui"
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
