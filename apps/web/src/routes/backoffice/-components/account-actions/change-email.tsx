import { Alert, Button, CloseTrigger, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminChangeUserEmail } from "../../../../domains/admin/users.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../lib/form-server-action.ts"

interface ChangeEmailButtonProps {
  readonly userId: string
  readonly currentEmail: string
}

/**
 * Change a user's primary login email.
 *
 * Renders an outline button that opens a form modal:
 *
 * - Pre-fills `currentEmail` so admins can edit one character without
 *   retyping the address (the most common path: a typo correction).
 * - Side-effect copy lives inline so the actor reads it before
 *   submitting:
 *     • Active sessions are NOT signed out — the user keeps working
 *       under the renamed account.
 *     • In-flight magic links keep working until they expire (~1 h).
 *     • `emailVerified` is preserved by design; admins are the source
 *       of truth and forcing re-verification negates the action.
 *     • Stripe customer email is NOT auto-synced (separate domain).
 *
 * Validation runs at the server boundary via Zod; per-field errors
 * surface back through the standard `createFormSubmitHandler` /
 * `fieldErrorsAsStrings` plumbing. We don't re-validate client-side
 * — keeping the schema source of truth on the server avoids drift.
 *
 * On success we `router.invalidate()` so the loader re-runs and the
 * dashboard re-renders with the new email everywhere
 * (hero, properties strip, recently-viewed cache, etc.).
 */
export function ChangeEmailButton({ userId, currentEmail }: ChangeEmailButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm({
    defaultValues: { newEmail: currentEmail },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        return await adminChangeUserEmail({
          data: { userId, newEmail: value.newEmail },
        })
      },
      {
        onSuccess: async (result) => {
          if (result.fromEmail === result.toEmail) {
            toast({ description: "Email unchanged." })
          } else {
            toast({ description: `Email updated to ${result.toEmail}.` })
          }
          setIsOpen(false)
          void router.invalidate()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Could not update email",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Change email
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) form.reset()
          setIsOpen(next)
        }}
      >
        <Modal.Content dismissible size="large">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <Modal.Header
              title="Change email"
              description={
                <Text.H5 color="foregroundMuted">
                  Update the primary login email for <span className="font-medium text-foreground">{currentEmail}</span>
                  .
                </Text.H5>
              }
            />
            <Modal.Body>
              <FormWrapper>
                <form.Field name="newEmail">
                  {(field) => (
                    <Input
                      required
                      type="email"
                      label="New email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="user@example.com"
                      autoComplete="off"
                    />
                  )}
                </form.Field>
                <Alert
                  variant="warning"
                  description="Active sessions stay signed in. In-flight magic links keep working until they expire (~1 h). The verified-email flag is preserved. Stripe customer email is not auto-synced."
                />
              </FormWrapper>
            </Modal.Body>
            <Modal.Footer>
              <CloseTrigger />
              <Button type="submit" size="sm" disabled={form.state.isSubmitting}>
                {form.state.isSubmitting ? "Updating…" : "Update email"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
