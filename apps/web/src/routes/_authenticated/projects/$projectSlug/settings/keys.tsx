import {
  Avatar,
  Badge,
  Button,
  CloseTrigger,
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
} from "../../../../../domains/api-keys/api-keys.collection.ts"
import type { ApiKeyRecord } from "../../../../../domains/api-keys/api-keys.functions.ts"
import { revokeOAuthKeyMutation, useOAuthKeysCollection } from "../../../../../domains/oauth/oauth-keys.collection.ts"
import type { OAuthKeyRecord } from "../../../../../domains/oauth/oauth-keys.functions.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { maskSensitiveValue } from "../../../../../lib/mask-sensitive-value.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/keys")({
  component: KeysSettingsPage,
})

function CreateApiKeyModal({
  open,
  setOpen,
  project,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  project: { readonly id: string; readonly name: string; readonly slug: string } | null
}) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: { name: "", scope: project ? ("project" as const) : ("organization" as const) },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const projectId = value.scope === "project" ? project?.id : null
        if (value.scope === "project" && !projectId) {
          throw new Error("This project is still loading. Try again in a moment.")
        }
        await insertApiKeyMutation(value.name, projectId)
      },
      {
        onSuccess: async () => {
          setOpen(false)
          toast({
            title: "Success",
            description: "API key created successfully.",
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
            title="Create API key"
            description="Project keys can only access this project. Organization keys can access every project."
          />
          <Modal.Body>
            <FormWrapper>
              <form.Field name="scope">
                {(field) => (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium">Scope</legend>
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="api-key-scope"
                        className="mt-1"
                        checked={field.state.value === "project"}
                        disabled={!project}
                        onChange={() => field.handleChange("project")}
                      />
                      <span>
                        <Text.H5>Project</Text.H5>
                        <Text.H6 color="foregroundMuted">
                          {project ? `Only ${project.name} (${project.slug})` : "Current project is still loading"}
                        </Text.H6>
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="api-key-scope"
                        className="mt-1"
                        checked={field.state.value === "organization"}
                        onChange={() => field.handleChange("organization")}
                      />
                      <span>
                        <Text.H5>Organization</Text.H5>
                        <Text.H6 color="foregroundMuted">Every project in this organization</Text.H6>
                      </span>
                    </label>
                  </fieldset>
                )}
              </form.Field>
              <form.Field name="name">
                {(field) => (
                  <Input
                    required
                    type="text"
                    label="Name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="My API key"
                    description="A descriptive name for this API key"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              Create API key
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
            description: "API key name updated.",
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
          <Modal.Header title="Update API key" description="Update the name for your API key." />
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
                    placeholder="API key name"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              Update API key
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
  const displayName = apiKey.name || "Latitude API key"

  const handleConfirm = async () => {
    setDeleting(true)
    try {
      await deleteApiKeyMutation(apiKey.id).isPersisted.promise
      toast({ description: "API key deleted" })
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
      title="Delete API key"
      description={`Are you sure you want to delete "${displayName}"? Any application using this Key will immediately lose access to the Latitude API. This action cannot be undone.`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <Text.H5 color="white">{deleting ? "Deleting..." : "Delete API key"}</Text.H5>
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
            <TableHead>Scope</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Created at</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((apiKey) => (
            <TableRow key={apiKey.id} verticalPadding hoverable={false}>
              <TableCell>
                <Text.H5>{apiKey.name || "Latitude API key"}</Text.H5>
              </TableCell>
              <TableCell>
                {apiKey.projectId ? (
                  <Badge variant="secondary">
                    {apiKey.projectSlug ? `Project · ${apiKey.projectSlug}` : "Project"}
                  </Badge>
                ) : (
                  <Badge variant="outline">Organization</Badge>
                )}
              </TableCell>
              <TableCell>
                <CopyableText
                  value={apiKey.token}
                  displayValue={maskSensitiveValue(apiKey.token)}
                  tooltip="Copy API key"
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
                    Edit API key name
                  </Tooltip>
                  <Tooltip
                    asChild
                    trigger={
                      <Button disabled={apiKeys.length === 1} variant="ghost" onClick={() => setApiKeyToDelete(apiKey)}>
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
      toast({ description: "OAuth key revoked" })
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
                    <Avatar name={row.clientName ?? "Unknown"} size="sm" />
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
                  Revoke OAuth key
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
          title="Revoke OAuth key"
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
                <Text.H5 color="white">{revoking ? "Revoking..." : "Revoke OAuth key"}</Text.H5>
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  )
}

function KeysSettingsPage() {
  const { projectSlug } = Route.useParams()
  const [createOpen, setCreateOpen] = useState(false)
  const { data: apiKeyData, isLoading: apiKeysLoading } = useApiKeysCollection()
  const { data: projects } = useProjectsCollection()
  const currentProject = (projects ?? []).find((project) => project.slug === projectSlug) ?? null
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
    <SettingsPage title="Keys" description="Manage API keys and OAuth connections. New keys default to this project.">
      <CreateApiKeyModal open={createOpen} setOpen={setCreateOpen} project={currentProject} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <Text.H4 weight="bold">API keys</Text.H4>
            <Text.H5 color="foregroundMuted">
              Organization keys reach every project. Project keys stay on the project shown in Scope.
            </Text.H5>
          </div>
          <div className="shrink-0">
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Icon size="sm" icon={PlusIcon} />
              API key
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {apiKeysLoading ? <TableSkeleton cols={3} rows={3} /> : <ApiKeysTable apiKeys={apiKeys} />}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Text.H4 weight="bold">OAuth keys</Text.H4>
          <Text.H5 color="foregroundMuted">
            Connected OAuth clients with access to this organization (Claude Code, Codex, Cursor... through MCP or
            Partners)
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
    </SettingsPage>
  )
}
