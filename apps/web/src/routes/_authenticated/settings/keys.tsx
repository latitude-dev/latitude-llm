import {
  Avatar,
  Button,
  CloseTrigger,
  Container,
  CopyableText,
  FormWrapper,
  Icon,
  Input,
  Modal,
  Table,
  TableBlankSlate,
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
import { relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon, Loader2, Pencil, PlusIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  deleteApiKeyMutation,
  insertApiKeyMutation,
  updateApiKeyMutation,
  useApiKeysCollection,
} from "../../../domains/api-keys/api-keys.collection.ts"
import type { ApiKeyRecord } from "../../../domains/api-keys/api-keys.functions.ts"
import { revokeOAuthKeyMutation, useOAuthKeysCollection } from "../../../domains/oauth/oauth-keys.collection.ts"
import type { OAuthKeyRecord } from "../../../domains/oauth/oauth-keys.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"

export const Route = createFileRoute("/_authenticated/settings/keys")({
  component: KeysSettingsPage,
})

function CreateApiKeyModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        await insertApiKeyMutation(value.name)
      },
      {
        onSuccess: async () => {
          setOpen(false)
          toast({
            title: "Success",
            description: "API Key created successfully.",
          })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
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
            description="Create a new API Key for your organization to access the Latitude API."
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
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="My API Key"
                    description="A descriptive name for this API Key"
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
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const transaction = updateApiKeyMutation(apiKey.id, value.name)
        await transaction.isPersisted.promise
      },
      {
        onSuccess: async () => {
          toast({
            title: "Success",
            description: "API Key name updated.",
          })
          onClose()
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
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
          <Modal.Header title="Update API Key" description="Update the name for your API Key." />
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
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="API Key name"
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

function DeleteApiKeyModal({ apiKey, onClose }: { apiKey: ApiKeyRecord; onClose: () => void }) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const displayName = apiKey.name || "Latitude API Key"

  const handleConfirm = async () => {
    setDeleting(true)
    try {
      await deleteApiKeyMutation(apiKey.id).isPersisted.promise
      toast({ description: "API Key deleted" })
      onClose()
    } catch (error) {
      setDeleting(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose()
      }}
      title="Delete API Key"
      description={`Are you sure you want to delete "${displayName}"? Any application using this Key will immediately lose access to the Latitude API. This action cannot be undone.`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <Text.H5 color="white">{deleting ? "Deleting..." : "Delete API Key"}</Text.H5>
          </Button>
        </div>
      }
    />
  )
}

function ApiKeysTable({ apiKeys }: { apiKeys: ApiKeyRecord[] }) {
  const [apiKeyToEdit, setApiKeyToEdit] = useState<ApiKeyRecord | null>(null)
  const [apiKeyToDelete, setApiKeyToDelete] = useState<ApiKeyRecord | null>(null)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Created at</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((apiKey) => (
            <TableRow key={apiKey.id} verticalPadding hoverable={false}>
              <TableCell>
                <Text.H5>{apiKey.name || "Latitude API Key"}</Text.H5>
              </TableCell>
              <TableCell>
                <CopyableText
                  value={apiKey.token}
                  displayValue={
                    apiKey.token.length > 7
                      ? `${apiKey.token.slice(0, 3)}********${apiKey.token.slice(-4)}`
                      : "********"
                  }
                  tooltip="Copy API Key"
                />
              </TableCell>
              <TableCell>
                <Text.H5 color="foregroundMuted">{relativeTime(apiKey.createdAt)}</Text.H5>
              </TableCell>
              <TableCell align="right">
                <div className="flex flex-row items-center gap-1">
                  <Tooltip
                    asChild
                    trigger={
                      <Button variant="ghost" onClick={() => setApiKeyToEdit(apiKey)}>
                        <Icon icon={Pencil} size="sm" />
                      </Button>
                    }
                  >
                    Edit API Key name
                  </Tooltip>
                  <Tooltip
                    asChild
                    trigger={
                      <Button disabled={apiKeys.length === 1} variant="ghost" onClick={() => setApiKeyToDelete(apiKey)}>
                        <Icon icon={Trash2} size="sm" />
                      </Button>
                    }
                  >
                    {apiKeys.length === 1 ? "You can't delete the last API Key" : "Delete API Key"}
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {apiKeyToEdit ? <UpdateApiKeyModal apiKey={apiKeyToEdit} onClose={() => setApiKeyToEdit(null)} /> : null}
      {apiKeyToDelete ? <DeleteApiKeyModal apiKey={apiKeyToDelete} onClose={() => setApiKeyToDelete(null)} /> : null}
    </>
  )
}

function OAuthKeysTable({ oauthKeys }: { oauthKeys: OAuthKeyRecord[] }) {
  const { toast } = useToast()
  const [keyToRevoke, setKeyToRevoke] = useState<OAuthKeyRecord | null>(null)
  const [revoking, setRevoking] = useState(false)

  const handleConfirm = async () => {
    if (!keyToRevoke) return
    setRevoking(true)
    try {
      await revokeOAuthKeyMutation({ clientId: keyToRevoke.clientId, userId: keyToRevoke.userId })
      toast({ description: "OAuth Key revoked" })
      setKeyToRevoke(null)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setRevoking(false)
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Authorized by</TableHead>
            <TableHead>Connected at</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {oauthKeys.map((row) => (
            <TableRow key={row.id} verticalPadding hoverable={false}>
              <TableCell>
                <div className="inline-flex justify-center items-center gap-2">
                  {row.clientIcon ? (
                    <img
                      src={row.clientIcon}
                      alt=""
                      className="h-6 w-6 inline-flex shrink-0 overflow-hidden rounded-full"
                    />
                  ) : (
                    <Avatar name="Unknown" size="sm" />
                  )}
                  <div className="flex flex-col">
                    <Text.H5>{row.clientName ?? "Unknown"}</Text.H5>
                    {row.disabled ? <Text.H6 color="destructive">Disabled</Text.H6> : null}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="inline-flex justify-center items-center gap-2">
                  <Avatar name={(row.userName ?? row.userEmail).trim()} size="sm" />
                  <Text.H5>{row.userName ?? row.userEmail}</Text.H5>
                </div>
              </TableCell>
              <TableCell>
                <Text.H5 color="foregroundMuted">{relativeTime(row.createdAt)}</Text.H5>
              </TableCell>
              <TableCell align="right">
                <Tooltip
                  asChild
                  trigger={
                    <Button variant="ghost" onClick={() => setKeyToRevoke(row)}>
                      <Icon icon={Trash2} size="sm" />
                    </Button>
                  }
                >
                  Revoke OAuth Key
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {keyToRevoke ? (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open && !revoking) setKeyToRevoke(null)
          }}
          title="Revoke OAuth Key"
          description={`Are you sure you want to revoke "${keyToRevoke.clientName ?? "this OAuth client"}" for ${
            keyToRevoke.userName ?? keyToRevoke.userEmail
          }? The client will immediately lose access to the Latitude API. This action cannot be undone.`}
          dismissible
          footer={
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" onClick={() => setKeyToRevoke(null)} disabled={revoking}>
                <Text.H5>Cancel</Text.H5>
              </Button>
              <Button variant="destructive" onClick={() => void handleConfirm()} disabled={revoking}>
                {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <Text.H5 color="white">{revoking ? "Revoking..." : "Revoke OAuth Key"}</Text.H5>
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  )
}

function KeysSettingsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: apiKeyData, isLoading: apiKeysLoading } = useApiKeysCollection()
  const { data: oauthKeyData, isLoading: oauthKeysLoading } = useOAuthKeysCollection()
  // `useLiveQuery` doesn't preserve the server-fn's ORDER BY — TanStack DB
  // iterates the collection by item key, not by insertion order — so we sort
  // here to match the "Created at" / "Connected at" columns the user reads.
  // Newest first.
  const byCreatedAtDesc = <T extends { readonly createdAt: string }>(a: T, b: T): number =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  const apiKeys = (apiKeyData ?? []).slice().sort(byCreatedAtDesc)
  const oauthKeys = (oauthKeyData ?? []).slice().sort(byCreatedAtDesc)

  return (
    <Container className="flex flex-col gap-12 pt-14">
      <CreateApiKeyModal open={createOpen} setOpen={setCreateOpen} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <Text.H4 weight="bold">API Keys</Text.H4>
            <Text.H5 color="foregroundMuted">
              Application keys with access to this organization (through API or SDK)
            </Text.H5>
          </div>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Icon size="sm" icon={PlusIcon} />
            API Key
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {apiKeysLoading ? <TableSkeleton cols={3} rows={3} /> : <ApiKeysTable apiKeys={apiKeys} />}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Text.H4 weight="bold">OAuth Keys</Text.H4>
          <Text.H5 color="foregroundMuted">
            Connected OAuth clients with access to this organization (Claude Code, Codex, Cursor... through MCP)
          </Text.H5>
        </div>
        <div className="flex flex-col gap-2">
          {oauthKeysLoading ? (
            <TableSkeleton cols={4} rows={2} />
          ) : oauthKeys.length === 0 ? (
            <TableBlankSlate
              description={
                <div className="flex flex-col justify-center items-center gap-4">
                  No OAuth clients connected yet
                  <a href="https://docs.latitude.so/getting-started/mcp" target="_blank" rel="noopener noreferrer">
                    <Button>
                      <Icon size="sm" icon={ExternalLinkIcon} />
                      Connect through MCP
                    </Button>
                  </a>
                </div>
              }
            />
          ) : (
            <OAuthKeysTable oauthKeys={oauthKeys} />
          )}
        </div>
      </section>
    </Container>
  )
}
