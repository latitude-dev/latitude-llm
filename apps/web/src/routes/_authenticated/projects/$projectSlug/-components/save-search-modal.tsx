import type { FilterSet } from "@domain/shared"
import {
  Button,
  CloseTrigger,
  cn,
  FormWrapper,
  Icon,
  Input,
  Modal,
  Popover,
  PopoverTrigger,
  Switch,
  Text,
  useToast,
} from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { BellRingIcon, CircleHelpIcon } from "lucide-react"
import { useState } from "react"
import {
  useCreateSavedSearch,
  useUpdateSavedSearch,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { extractFieldErrors, toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { AlertCardForm } from "../monitors/-components/alert-card-form.tsx"
import {
  type AlertDraft,
  type AlertFieldErrors,
  alertFieldErrorsFrom,
  draftToCondition,
  emptyAlertDraft,
} from "../monitors/-components/alert-form-helpers.ts"
import { SemanticMonitorPopoverContent, searchHasSemanticPart } from "./semantic-monitor-notice.tsx"

interface BaseProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly projectId: string
}

interface CreateProps extends BaseProps {
  readonly mode: "create"
  readonly projectSlug: string
  readonly query: string | null
  readonly filterSet: FilterSet
  readonly onCreated: (record: SavedSearchRecord) => void
}

interface RenameProps extends BaseProps {
  readonly mode: "rename"
  readonly savedSearch: SavedSearchRecord
  /** Receives the updated record (slug may have changed) so callers can re-point a `savedSearch` URL param. */
  readonly onRenamed?: (record: SavedSearchRecord) => void
}

export type SaveSearchModalProps = CreateProps | RenameProps

export function SaveSearchModal(props: SaveSearchModalProps) {
  return props.mode === "create" ? <CreateModal {...props} /> : <RenameModal {...props} />
}

const MONITOR_ERROR_PREFIX = "monitor."

function monitorAlertErrorsFrom(error: unknown): AlertFieldErrors {
  const fieldErrors = extractFieldErrors(error)
  if (!fieldErrors) return {}
  const scoped: Record<string, string[]> = {}
  for (const [path, messages] of Object.entries(fieldErrors)) {
    if (path.startsWith(MONITOR_ERROR_PREFIX)) scoped[path.slice(MONITOR_ERROR_PREFIX.length)] = messages
  }
  return alertFieldErrorsFrom(scoped, null)
}

function CreateModal({ open, onClose, projectId, projectSlug, query, filterSet, onCreated }: CreateProps) {
  const { toast } = useToast()
  const createMutation = useCreateSavedSearch(projectId)
  const [withMonitor, setWithMonitor] = useState(false)
  const [alertDraft, setAlertDraft] = useState<AlertDraft>(() => emptyAlertDraft())
  const [alertErrors, setAlertErrors] = useState<AlertFieldErrors>({})

  // Searches with a semantic part have no exact match rule for a monitor to count against.
  const semanticQuery = searchHasSemanticPart(query)
  const createMonitor = withMonitor && !semanticQuery

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        try {
          return await createMutation.mutateAsync({
            name: value.name.trim(),
            query,
            filterSet,
            ...(createMonitor
              ? {
                  monitor: {
                    kind: alertDraft.kind,
                    condition: draftToCondition(alertDraft),
                    severity: alertDraft.severity,
                  },
                }
              : {}),
          })
        } catch (error) {
          // `createFormSubmitHandler` only maps Zod errors onto form fields;
          // the alert section isn't a form field, so route `monitor.*` errors
          // to it here before the handler swallows them.
          setAlertErrors(monitorAlertErrorsFrom(error))
          throw error
        }
      },
      {
        onSuccess: (record) => {
          toast({
            title: "Search saved",
            description: createMonitor
              ? `"${record.name}" was saved and a monitor is now watching it.`
              : `"${record.name}" is now available in your saved searches.`,
          })
          onCreated(record)
          onClose()
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Could not save search", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onClose}
      title="Save search"
      description="Save the current query and filters so you can return to them later"
      footer={
        <>
          <CloseTrigger />
          <Button type="submit" onClick={() => void form.handleSubmit()}>
            Save search
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FormWrapper>
          <form.Field name="name">
            {(field) => (
              <Input
                required
                autoFocus
                type="text"
                label="Name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                placeholder="Failed payments"
              />
            )}
          </form.Field>
          <div className="flex flex-col gap-1.5">
            {semanticQuery ? (
              <div className="flex items-center gap-1.5">
                <Text.H6 color="foregroundMuted">This search can&apos;t have a monitor</Text.H6>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Why can't this search have a monitor?"
                      className="flex shrink-0 cursor-pointer items-center"
                    >
                      <Icon icon={CircleHelpIcon} size="sm" color="foregroundMuted" />
                    </button>
                  </PopoverTrigger>
                  <SemanticMonitorPopoverContent />
                </Popover>
              </div>
            ) : null}
            <div className={cn("flex flex-col rounded-lg border border-border", { "opacity-60": semanticQuery })}>
              <label
                htmlFor="save-search-monitor-toggle"
                className={cn("flex items-center justify-between gap-3 p-3", {
                  "cursor-default": semanticQuery,
                  "cursor-pointer": !semanticQuery,
                })}
              >
                <div className="flex items-start gap-2">
                  <Icon icon={BellRingIcon} size="sm" color="foregroundMuted" className="mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <Text.H5M>Monitor this search</Text.H5M>
                    <Text.H6 color="foregroundMuted">Open incidents when traces match this search</Text.H6>
                  </div>
                </div>
                <Switch
                  id="save-search-monitor-toggle"
                  disabled={semanticQuery}
                  checked={withMonitor && !semanticQuery}
                  onCheckedChange={(checked) => {
                    setWithMonitor(checked)
                    if (!checked) setAlertErrors({})
                  }}
                />
              </label>
              {createMonitor ? (
                <div className="border-t border-border p-3">
                  <form.Subscribe selector={(state) => state.values.name}>
                    {(name) => (
                      <AlertCardForm
                        value={alertDraft}
                        onChange={(next) => {
                          setAlertDraft(next)
                          setAlertErrors({})
                        }}
                        projectId={projectId}
                        projectSlug={projectSlug}
                        showSourcePicker={false}
                        {...(name.trim() ? { sourceName: name.trim() } : {})}
                        errors={alertErrors}
                      />
                    )}
                  </form.Subscribe>
                </div>
              ) : null}
            </div>
          </div>
        </FormWrapper>
      </form>
    </Modal>
  )
}

function RenameModal({ open, onClose, projectId, savedSearch, onRenamed }: RenameProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateSavedSearch(projectId)

  const form = useForm({
    defaultValues: { name: savedSearch.name },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const next = value.name.trim()
        if (next === savedSearch.name) return savedSearch
        return updateMutation.mutateAsync({ id: savedSearch.id, name: next })
      },
      {
        onSuccess: (record) => {
          toast({ title: "Saved search renamed" })
          onRenamed?.(record)
          onClose()
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Could not rename", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onClose}
      title="Rename saved search"
      description="Change the name of this saved search"
      footer={
        <>
          <CloseTrigger />
          <Button type="submit" onClick={() => void form.handleSubmit()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FormWrapper>
          <form.Field name="name">
            {(field) => (
              <Input
                required
                autoFocus
                type="text"
                label="Name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}
