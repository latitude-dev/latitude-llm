import { Button, Input, Text } from "@repo/ui"
import { fieldErrorsAsStrings } from "../../../../../../../lib/form-server-action.ts"
import type { OnboardingForm } from "../../onboarding-flow.tsx"

export function Left({ form, onNext }: { readonly form: OnboardingForm; readonly onNext: () => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8">
            <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">Tell us about yourself</Text.H2>
            <Text.H4 color="foregroundMuted">Help Latitude personalize your experience.</Text.H4>
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
        <form.Field name="phoneNumber">
          {(field) => (
            <Input
              type="tel"
              label="Phone number (optional)"
              description="Helpful if we need to reach you about your setup."
              placeholder="+1 555 0100"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
              maxLength={64}
              autoComplete="tel"
            />
          )}
        </form.Field>
        <div>
          <Button onClick={onNext}>Next</Button>
        </div>
      </div>
    </div>
  )
}
