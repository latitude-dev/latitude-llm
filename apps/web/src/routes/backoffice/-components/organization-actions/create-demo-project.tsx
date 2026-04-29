import { Alert, Button, CloseTrigger, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { adminCreateDemoProject } from "../../../../domains/admin/organizations.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../lib/form-server-action.ts"

interface CreateDemoProjectButtonProps {
  readonly organizationId: string
}

const DEFAULT_PROJECT_NAME = "Demo Project"

/**
 * Create a fully-seeded demo project on the target organization.
 *
 * The user-facing surface is a form modal — not the simpler
 * confirmation modal — because the project name is something the
 * staff types per call. Default value is "Demo Project"; staff can
 * override (e.g. to "Demo Project — Q4 onboarding") and that string
 * lands verbatim in the project list.
 *
 * Inline copy spells out the behaviour:
 *  - Seeds the bootstrap content (datasets, evaluations, issues,
 *    annotation queues, scores, ~30 days of telemetry) under a fresh
 *    project on this organization.
 *  - The org's existing default API key is reused — no new credentials
 *    are created.
 *  - Seeding runs in the background; the project row appears
 *    immediately but content fills in over a minute or two.
 *  - A name collision with an existing project on the same org fails
 *    fast with a clear toast — staff can retry with a different name.
 *
 * On success the modal closes and `router.invalidate()` re-runs the
 * org-detail loader so the new project shows up in the projects list.
 * The seeded content (datasets, evaluations, etc.) only becomes
 * visible once the workflow finishes — staff refresh the project's
 * page to see it land.
 */
export function CreateDemoProjectButton({ organizationId }: CreateDemoProjectButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm({
    defaultValues: { projectName: DEFAULT_PROJECT_NAME },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        return await adminCreateDemoProject({
          data: { organizationId, projectName: value.projectName },
        })
      },
      {
        onSuccess: async (result) => {
          toast({
            description: `Demo project "${result.projectSlug}" created — seeding in background.`,
          })
          setIsOpen(false)
          void router.invalidate()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Could not create demo project",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Create demo project
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(next) => {
          // Reset to the default name on close so the next open starts
          // fresh — staff usually want "Demo Project" by default.
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
              title="Create demo project"
              description={
                <Text.H5 color="foregroundMuted">
                  Create a fully-seeded project on this organization for support / demo flows.
                </Text.H5>
              }
            />
            <Modal.Body>
              <FormWrapper>
                <form.Field name="projectName">
                  {(field) => (
                    <Input
                      required
                      type="text"
                      label="Project name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder={DEFAULT_PROJECT_NAME}
                      autoComplete="off"
                    />
                  )}
                </form.Field>
                <Alert
                  variant="warning"
                  description="Seeds the project with the bootstrap content set — datasets, evaluations, issues, annotation queues, scores, and ~30 days of trace telemetry. Reuses the org's existing default API key (no new credentials are created). Runs in the background; the project row appears immediately but content fills in over a minute or two. Fails if a project with the same name already exists on this org."
                />
              </FormWrapper>
            </Modal.Body>
            <Modal.Footer>
              <CloseTrigger />
              <Button type="submit" size="sm" disabled={form.state.isSubmitting}>
                {form.state.isSubmitting ? "Creating…" : "Create demo project"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
