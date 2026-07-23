import { Button, Input, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { AuthScreen } from "../../components/auth-screen.tsx"
import { completeOnboarding } from "../../domains/organizations/organizations.functions.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { gtmHeadScripts, validateTrackingSearch } from "../../lib/analytics/gtm.ts"
import { resolveEntryDestination } from "../../lib/entry-destination.ts"
import { toUserMessage } from "../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../lib/form-server-action.ts"
import { welcomeLoader } from "./-lib/loader.ts"

export const Route = createFileRoute("/welcome/")({
  component: WelcomePage,
  validateSearch: validateTrackingSearch,
  head: () => ({ scripts: gtmHeadScripts() }),
  loader: () => welcomeLoader({ getSession, resolveEntryDestination }),
})

function WelcomePage() {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: { name: "", organizationName: "" },
    onSubmit: createFormSubmitHandler((value) => completeOnboarding({ data: value }), {
      resetOnSuccess: false,
      onSuccess: ({ defaultProjectSlug }) => {
        window.location.href = `/projects/${defaultProjectSlug}/onboarding`
      },
      onError: (err) => toast({ variant: "destructive", description: toUserMessage(err) }),
    }),
  })

  return (
    <AuthScreen title="Complete your profile" description="Tell us a bit about yourself">
      <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Input
                type="text"
                name={field.name}
                label="Your name"
                placeholder="Ex.: John Doe"
                autoComplete="name"
                data-autofocus="true"
                background="background"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>

          <form.Field name="organizationName">
            {(field) => (
              <Input
                type="text"
                name={field.name}
                label="Organization name"
                placeholder="Ex.: Acme Inc."
                background="background"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isFormSubmitting) => (
              <Button size="full" type="submit" variant="default" disabled={isFormSubmitting}>
                {isFormSubmitting ? "Saving…" : "Continue"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </AuthScreen>
  )
}
