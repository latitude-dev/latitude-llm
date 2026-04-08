import {
  Button,
  CloseTrigger,
  Container,
  CopyableText,
  FormWrapper,
  Icon,
  Input,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  deleteApiKeyMutation,
  insertApiKeyMutation,
  updateApiKeyMutation,
  useApiKeysCollection,
} from "../../../domains/api-keys/api-keys.collection.ts"
import type { ApiKeyRecord } from "../../../domains/api-keys/api-keys.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { SettingsPageHeader } from "./-components/settings-page-header.tsx"

export const Route = createFileRoute("/_authenticated/settings/api-keys")({
  component: ApiKeysSettingsPage,
})

function CreateApiKeyModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      try {
        await insertApiKeyMutation(value.name)
        setOpen(false)
        toast({
          title: "Success",
          description: "API key created successfully.",
        })
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
      }
    },
  })

  return (
    <Modal.Root open={open} onOpenChange={setOpen}>
      <Modal.Content dismissible>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <Modal.Header
            title="Create API Key"
            description="Create a new API key for your organization to access the Latitude API."
          />
          <Modal.Body>
            <FormWrapper>
              <form.Field name="name">
                {(field) => (
                  <Input
                    required
                    type="text"
                    label="Name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="My API Key"
                    description="A descriptive name for this API key"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              Create API Key
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}

function UpdateApiKeyModal({ apiKey, onClose }: { apiKey: ApiKeyRecord; onClose: () => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: { name: apiKey.name ?? "" },
    onSubmit: async ({ value }) => {
      const transaction = updateApiKeyMutation(apiKey.id, value.name)
      await transaction.isPersisted.promise
      toast({
        title: "Success",
        description: "API key name updated.",
      })
      onClose()
    },
  })

  return (
    <Modal.Root open onOpenChange={onClose}>
      <Modal.Content dismissible>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <Modal.Header title="Update API Key" description="Update the name for your API key." />
          <Modal.Body>
            <FormWrapper>
              <form.Field name="name">
                {(field) => (
                  <Input
                    required
                    type="text"
                    label="Name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="API key name"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              Update API Key
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}

function ApiKeysTable({ apiKeys }: { apiKeys: ApiKeyRecord[] }) {
  const { toast } = useToast()
  const [apiKeyToEdit, setApiKeyToEdit] = useState<ApiKeyRecord | null>(null)

  return (
    <>
      <Table variant="listing">
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>Name</TableHead>
            <TableHead>API Key</TableHead>
            <TableHead align="right" className="w-24 min-w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((apiKey) => (
            <TableRow key={apiKey.id} hoverable={false}>
              <TableCell>
                <Text.H5 ellipsis noWrap className="min-w-0">
                  {apiKey.name || "Latitude API Key"}
                </Text.H5>
              </TableCell>
              <TableCell>
                <CopyableText
                  value={apiKey.token}
                  displayValue={
                    apiKey.token.length > 7
                      ? `${apiKey.token.slice(0, 3)}********${apiKey.token.slice(-4)}`
                      : "********"
                  }
                  tooltip="Copy API key"
                />
              </TableCell>
              <TableCell align="right" className="w-24 max-w-none min-w-24 shrink-0">
                <div className="flex flex-row items-center justify-end gap-1">
                  <Tooltip
                    asChild
                    trigger={
                      <Button variant="ghost" onClick={() => setApiKeyToEdit(apiKey)}>
                        <Icon icon={Pencil} size="sm" />
                      </Button>
                    }
                  >
                    Edit API key name
                  </Tooltip>
                  <Tooltip
                    asChild
                    trigger={
                      <Button
                        disabled={apiKeys.length === 1}
                        variant="ghost"
                        onClick={() => {
                          void deleteApiKeyMutation(apiKey.id).isPersisted.promise.then(() => {
                            toast({ description: "API key deleted" })
                          })
                        }}
                      >
                        <Icon icon={Trash2} size="sm" />
                      </Button>
                    }
                  >
                    {apiKeys.length === 1 ? "You can't delete the last API key" : "Delete API key"}
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {apiKeyToEdit ? <UpdateApiKeyModal apiKey={apiKeyToEdit} onClose={() => setApiKeyToEdit(null)} /> : null}
    </>
  )
}

function ApiKeysSettingsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useApiKeysCollection()
  const apiKeys = data ?? []

  return (
    <Container className="flex flex-col gap-8 p-6">
      <CreateApiKeyModal open={createOpen} setOpen={setCreateOpen} />
      <div className="flex flex-row items-start justify-between gap-4">
        <SettingsPageHeader
          className="min-w-0 flex-1"
          title="API Keys"
          description="Create and manage API keys for programmatic access to the Latitude API."
        />
        <Button variant="outline" className="shrink-0" onClick={() => setCreateOpen(true)}>
          Create API Key
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {isLoading ? <TableSkeleton cols={3} rows={3} variant="listing" /> : <ApiKeysTable apiKeys={apiKeys} />}
      </div>
    </Container>
  )
}
