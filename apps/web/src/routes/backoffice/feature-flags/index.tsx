import { Button, CloseTrigger, FormWrapper, Icon, Input, Modal, Text, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Flag, Plus } from "lucide-react"
import { useState } from "react"
import {
  type AdminFeatureFlagDto,
  adminCreateFeatureFlag,
  adminListArchivedFeatureFlags,
  adminListFeatureFlags,
} from "../../../domains/admin/feature-flags.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"
import { ArchivedFlagsSection } from "./-components/archived-flags-section.tsx"
import { FeatureFlagRow } from "./-components/feature-flag-row.tsx"

export const Route = createFileRoute("/backoffice/feature-flags/")({
  loader: async () => {
    const [featureFlags, archivedFeatureFlags] = await Promise.all([
      adminListFeatureFlags(),
      adminListArchivedFeatureFlags(),
    ])
    return { featureFlags, archivedFeatureFlags }
  },
  component: BackofficeFeatureFlagsPage,
})

function BackofficeFeatureFlagsPage() {
  const { featureFlags, archivedFeatureFlags } = Route.useLoaderData() as {
    readonly featureFlags: AdminFeatureFlagDto[]
    readonly archivedFeatureFlags: AdminFeatureFlagDto[]
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-8 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon icon={Flag} size="sm" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H4 weight="semibold">Feature Flags</Text.H4>
            <Text.H6 color="foregroundMuted">Manage stable code-facing flags and where they are enabled.</Text.H6>
          </div>
        </div>
        <CreateFeatureFlagButton />
      </div>

      {featureFlags.length === 0 ? (
        <EmptyFeatureFlagsState />
      ) : (
        <div className="flex flex-col gap-2">
          {featureFlags.map((featureFlag) => (
            <FeatureFlagRow key={featureFlag.id} featureFlag={featureFlag} />
          ))}
        </div>
      )}

      <ArchivedFlagsSection featureFlags={archivedFeatureFlags} />
    </div>
  )
}

function EmptyFeatureFlagsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={Flag} size="default" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <Text.H5 weight="medium">No feature flags yet</Text.H5>
        <Text.H6 color="foregroundMuted">
          Create the first code-facing flag, then enable it for every organization or just a few.
        </Text.H6>
      </div>
    </div>
  )
}

function CreateFeatureFlagButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm({
    defaultValues: { identifier: "", name: "", description: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        return await adminCreateFeatureFlag({
          data: {
            identifier: value.identifier,
            name: value.name.trim().length > 0 ? value.name : null,
            description: value.description.trim().length > 0 ? value.description : null,
          },
        })
      },
      {
        onSuccess: async (featureFlag) => {
          toast({ description: `Created "${featureFlag.identifier}".` })
          setIsOpen(false)
          void router.invalidate()
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Could not create feature flag",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>
        <Icon icon={Plus} size="sm" />
        Create feature flag
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
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <Modal.Header
              title="Create feature flag"
              description="Create the stable identifier that code will reference."
            />
            <Modal.Body>
              <FormWrapper>
                <form.Field name="identifier">
                  {(field) => (
                    <Input
                      required
                      label="Identifier"
                      description="Use a stable code-facing id, for example billing.v2 or new-dashboard. Letters, numbers, and the characters - _ / . only. Avoid renaming after code references it."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="new-dashboard"
                      autoComplete="off"
                    />
                  )}
                </form.Field>
                <form.Field name="name">
                  {(field) => (
                    <Input
                      label="Name"
                      description="Optional human-facing label for Backoffice."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="New dashboard"
                      autoComplete="off"
                    />
                  )}
                </form.Field>
                <form.Field name="description">
                  {(field) => (
                    <Textarea
                      label="Description"
                      description="Optional context for when staff should enable this flag."
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                      placeholder="What this flag enables and when staff should use it."
                      minRows={4}
                    />
                  )}
                </form.Field>
              </FormWrapper>
            </Modal.Body>
            <Modal.Footer>
              <CloseTrigger />
              <Button type="submit" size="sm" disabled={form.state.isSubmitting}>
                {form.state.isSubmitting ? "Creating…" : "Create feature flag"}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
