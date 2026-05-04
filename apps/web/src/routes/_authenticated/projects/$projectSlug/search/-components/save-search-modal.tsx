import type { FilterSet } from "@domain/shared"
import { Button, CloseTrigger, FormWrapper, Input, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import {
  useCreateSavedSearch,
  useUpdateSavedSearch,
} from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import type { SavedSearchRecord } from "../../../../../../domains/saved-searches/saved-searches.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"

interface BaseProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly projectId: string
}

interface CreateProps extends BaseProps {
  readonly mode: "create"
  readonly query: string | null
  readonly filterSet: FilterSet
  readonly onCreated: (record: SavedSearchRecord) => void
}

interface RenameProps extends BaseProps {
  readonly mode: "rename"
  readonly savedSearch: SavedSearchRecord
}

export type SaveSearchModalProps = CreateProps | RenameProps

export function SaveSearchModal(props: SaveSearchModalProps) {
  return props.mode === "create" ? <CreateModal {...props} /> : <RenameModal {...props} />
}

function CreateModal({ open, onClose, projectId, query, filterSet, onCreated }: CreateProps) {
  const { toast } = useToast()
  const createMutation = useCreateSavedSearch(projectId)

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => createMutation.mutateAsync({ name: value.name.trim(), query, filterSet }),
      {
        onSuccess: (record) => {
          toast({ title: "Search saved", description: `"${record.name}" is now available in your saved searches.` })
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
      description="Save the current query and filters so you can return to them later."
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
                placeholder="Failed payments last week"
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}

function RenameModal({ open, onClose, projectId, savedSearch }: RenameProps) {
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
        onSuccess: () => {
          toast({ title: "Saved search renamed" })
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
          <Text.H6 color="foregroundMuted">Renaming changes the saved search's URL slug.</Text.H6>
        </FormWrapper>
      </form>
    </Modal>
  )
}
