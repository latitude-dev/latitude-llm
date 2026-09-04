import type { FilterSet } from "@domain/shared"
import { Button, CloseTrigger, FormWrapper, Icon, Input, Modal, Switch, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { FlaskConicalIcon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"
import { useCreateExperimentFromSearch } from "../../../../../domains/experiments/experiments.collection.ts"
import {
  useCreateSavedSearch,
  useUpdateSavedSearch,
} from "../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../domains/saved-searches/saved-searches.functions.ts"
import { useCreateSignalFromSearch } from "../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"

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

function CreateModal({ open, onClose, projectId, projectSlug, query, filterSet, onCreated }: CreateProps) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const createMutation = useCreateSavedSearch(projectId)
  const createSignalMutation = useCreateSignalFromSearch(projectId)
  const createExperimentMutation = useCreateExperimentFromSearch(projectId)
  const [withSignal, setWithSignal] = useState(false)
  const [withExperiment, setWithExperiment] = useState(false)

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: createFormSubmitHandler(
      (value) => createMutation.mutateAsync({ name: value.name.trim(), query, filterSet }),
      {
        onSuccess: async (record) => {
          toast({
            title: "Search saved",
            description: `"${record.name}" is now available in your saved searches.`,
          })
          let signalSlug: string | null = null
          if (withSignal) {
            try {
              const signal = await createSignalMutation.mutateAsync({ name: record.name, query, filterSet })
              signalSlug = signal.slug
              toast({ title: "Signal created", description: `"${record.name}" is now tracking new sessions.` })
            } catch (error) {
              toast({ variant: "destructive", title: "Could not create signal", description: toUserMessage(error) })
            }
          }
          // With both companions requested the experiment wins the redirect; the signal is reachable
          // from the Signals page either way.
          if (withExperiment) {
            try {
              const experiment = await createExperimentMutation.mutateAsync({
                name: record.name,
                filterSet,
                query,
              })
              onClose()
              void navigate({
                to: "/projects/$projectSlug/experiments/$experimentSlug",
                params: { projectSlug, experimentSlug: experiment.slug },
                search: { created: true },
              })
              return
            } catch (error) {
              toast({
                variant: "destructive",
                title: "Could not create experiment",
                description: toUserMessage(error),
              })
            }
          }
          if (signalSlug !== null) {
            onClose()
            void navigate({
              to: "/projects/$projectSlug/signals/$signalSlug",
              params: { projectSlug, signalSlug },
            })
            return
          }
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
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                disabled={isSubmitting}
                isLoading={isSubmitting}
                onClick={() => void form.handleSubmit()}
              >
                Save search
              </Button>
            )}
          </form.Subscribe>
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
            <div className="flex flex-col rounded-lg border border-border">
              <label
                htmlFor="save-search-signal-toggle"
                className="flex cursor-pointer items-center justify-between gap-3 p-3"
              >
                <div className="flex items-start gap-2">
                  <Icon icon={ShieldAlertIcon} size="sm" color="foregroundMuted" className="mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <Text.H5M>Create a signal from this search</Text.H5M>
                    <Text.H6 color="foregroundMuted">
                      Continuously detect and track sessions matching this search
                    </Text.H6>
                  </div>
                </div>
                <Switch id="save-search-signal-toggle" checked={withSignal} onCheckedChange={setWithSignal} />
              </label>
            </div>
            <div className="flex flex-col rounded-lg border border-border">
              <label
                htmlFor="save-search-experiment-toggle"
                className="flex cursor-pointer items-center justify-between gap-3 p-3"
              >
                <div className="flex items-start gap-2">
                  <Icon icon={FlaskConicalIcon} size="sm" color="foregroundMuted" className="mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <Text.H5M>Compare this search</Text.H5M>
                    <Text.H6 color="foregroundMuted">Create a new experiment with this search as the baseline</Text.H6>
                  </div>
                </div>
                <Switch
                  id="save-search-experiment-toggle"
                  checked={withExperiment}
                  onCheckedChange={setWithExperiment}
                />
              </label>
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
