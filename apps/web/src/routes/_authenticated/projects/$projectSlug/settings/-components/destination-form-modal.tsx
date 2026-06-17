import { Button, CloseTrigger, Icon, Input, Modal, Select, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react"
import { useState } from "react"
import {
  createDestination,
  type DestinationConnectionTestResult,
  type DestinationRecord,
  testDestinationConnection,
  testExistingDestinationConnection,
  updateDestination,
} from "../../../../../../domains/destinations/destinations.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
import {
  DEFAULT_DESTINATION_KIND,
  DESTINATION_FORM_MODULES,
  DESTINATION_KIND_OPTIONS,
} from "./destination-forms/index.ts"
import { destinationsQueryKey } from "./destinations-section.tsx"

/** Inline connection-probe feedback — fully kind-agnostic; the adapter owns what a passing probe means. */
type ConnectionTest =
  | { readonly phase: "idle" }
  | { readonly phase: "testing" }
  | { readonly phase: "success" }
  | { readonly phase: "error"; readonly message: string }

/**
 * Create or edit a destination. The shell owns everything kind-agnostic —
 * Modal chrome, the kind picker, the name field, create/update mutations, the
 * connection probe, and toasts — and delegates the kind-specific fields and
 * value→payload mapping to the matching {@link DESTINATION_FORM_MODULES} entry.
 * Mounted only while open so form defaults reset per target. On edit the secret
 * is never returned from the server — a blank secret field leaves it untouched.
 * v1 ships a single kind, so the kind picker is fixed.
 */
export function DestinationFormModal({
  projectId,
  destination,
  onClose,
}: {
  readonly projectId: string
  readonly destination?: DestinationRecord | undefined
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const isEdit = destination !== undefined

  const kind = destination?.kind ?? DEFAULT_DESTINATION_KIND
  const formModule = DESTINATION_FORM_MODULES[kind]
  const [connectionTest, setConnectionTest] = useState<ConnectionTest>({ phase: "idle" })
  const testing = connectionTest.phase === "testing"

  const create = useMutation({ mutationFn: createDestination })
  const update = useMutation({ mutationFn: updateDestination })

  const form = useForm({
    defaultValues: {
      name: destination?.name ?? "",
      ...formModule.defaultValues(destination),
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const name = value.name.trim()
        const config = formModule.buildConfig(value)
        const sourceConfigs = formModule.buildSourceConfigs(value)

        if (isEdit) {
          return update.mutateAsync({
            data: {
              projectId,
              destinationId: destination.id,
              name,
              config,
              sourceConfigs,
              ...(formModule.credentialsProvided(value) ? { credentials: formModule.buildCredentials(value) } : {}),
            },
          })
        }

        return create.mutateAsync({
          data: { projectId, name, config, sourceConfigs, credentials: formModule.buildCredentials(value) },
        })
      },
      {
        resetOnSuccess: !isEdit,
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: destinationsQueryKey(projectId) })
          toast({ description: isEdit ? "Destination updated." : "Destination connected." })
          onClose()
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
      },
    ),
  })

  const handleTestConnection = async () => {
    const values = form.state.values
    const config = formModule.buildConfig(values)

    // New key typed → probe it inline. On edit with a blank key → probe the stored key.
    // On create with no key → nudge to enter one.
    let probe: Promise<DestinationConnectionTestResult>
    if (formModule.credentialsProvided(values)) {
      probe = testDestinationConnection({ data: { config, credentials: formModule.buildCredentials(values) } })
    } else if (destination) {
      probe = testExistingDestinationConnection({ data: { destinationId: destination.id, config } })
    } else {
      setConnectionTest({ phase: "error", message: "Enter your credentials to test the connection." })
      return
    }

    setConnectionTest({ phase: "testing" })
    try {
      const result = await probe
      if (result.ok) {
        setConnectionTest({ phase: "success" })
      } else {
        setConnectionTest({
          phase: "error",
          message: result.retryable
            ? `Connection failed (${result.reason ?? "unknown"}). This may be transient — try again.`
            : `Connection rejected (${result.reason ?? "unknown"}). Check the configuration and credentials.`,
        })
      }
    } catch (error) {
      setConnectionTest({ phase: "error", message: toUserMessage(error) })
    }
  }

  const Fields = formModule.Fields

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={isEdit ? "Edit destination" : "Connect a destination"}
      description="Continuously sync this project's traces into a customer-owned analytics tool."
      footer={
        <>
          <CloseTrigger />
          <Button variant="outline" onClick={() => void handleTestConnection()} disabled={testing} isLoading={testing}>
            Test connection
          </Button>
          <Button type="submit" onClick={() => void form.handleSubmit()}>
            {isEdit ? "Save" : "Connect"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <Select
          name="kind"
          label="Destination"
          options={DESTINATION_KIND_OPTIONS}
          value={kind}
          disabled
          onChange={() => {}}
        />

        <form.Field name="name">
          {(field) => (
            <Input
              required
              autoFocus
              label="Name"
              placeholder="My destination"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>

        <Fields form={form} isEdit={isEdit} projectId={projectId} destination={destination} />

        {connectionTest.phase === "testing" ? (
          <div className="flex items-center gap-2">
            <Icon icon={Loader2} size="sm" color="foregroundMuted" className="animate-spin" />
            <Text.H6 color="foregroundMuted">Testing connection…</Text.H6>
          </div>
        ) : null}
        {connectionTest.phase === "success" ? (
          <div className="flex items-center gap-2">
            <Icon icon={CircleCheck} size="sm" color="success" />
            <Text.H6 color="success">Connection succeeded.</Text.H6>
          </div>
        ) : null}
        {connectionTest.phase === "error" ? (
          <div className="flex items-center gap-2">
            <Icon icon={CircleAlert} size="sm" color="destructive" />
            <Text.H6 color="destructive">{connectionTest.message}</Text.H6>
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
