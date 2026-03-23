import {
  Button,
  CloseTrigger,
  Container,
  FormWrapper,
  Icon,
  Input,
  Label,
  Modal,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableWithHeader,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { Clipboard, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  deleteApiKeyMutation,
  updateApiKeyMutation,
  useApiKeysCollection,
} from "../../domains/api-keys/api-keys.collection.ts"
import { type ApiKeyRecord, createApiKey } from "../../domains/api-keys/api-keys.functions.ts"
import {
  cancelMemberInviteMutation,
  createMemberInviteIntentMutation,
  removeMemberMutation,
  useMembersCollection,
} from "../../domains/members/members.collection.ts"
import type { MemberRecord } from "../../domains/members/members.functions.ts"
import {
  updateOrganizationMutation,
  useOrganizationCollection,
} from "../../domains/organizations/organizations.collection.ts"
import { authClient } from "../../lib/auth-client.ts"
import { WEB_BASE_URL } from "../../lib/auth-config.ts"
import { toUserMessage } from "../../lib/errors.ts"

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
})

function OrganizationSection() {
  const { data: org } = useOrganizationCollection((orgs) => orgs.findOne())

  if (!org) return null

  const handleNameSubmit = (name: string) => {
    updateOrganizationMutation(org.id, { name })
  }

  const handleKeepMonitoringChange = (checked: boolean) => {
    updateOrganizationMutation(org.id, { settings: { keepMonitoring: checked } })
  }

  return (
    <div className="flex flex-col gap-6">
      <OrganizationNameForm name={org.name} onSubmit={handleNameSubmit} />
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <Label htmlFor="keep-monitoring">Keep monitoring after resolution</Label>
          <Text.H6 color="foregroundMuted">
            When enabled, linked evaluations stay active after an issue is resolved to detect regressions.
          </Text.H6>
        </div>
        <Switch
          id="keep-monitoring"
          checked={org.settings.keepMonitoring ?? true}
          onCheckedChange={handleKeepMonitoringChange}
        />
      </div>
    </div>
  )
}

function OrganizationNameForm({ name, onSubmit }: { name: string; onSubmit: (name: string) => void }) {
  const form = useForm({
    defaultValues: { name },
    onSubmit: ({ value }) => {
      onSubmit(value.name)
    },
  })

  return (
    <form
      className="flex flex-row items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Input
            required
            type="text"
            label="Organization Name"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder="Organization name"
          />
        )}
      </form.Field>
      <Button type="submit">Save</Button>
    </form>
  )
}

function InviteMemberModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const { intentId, transaction } = createMemberInviteIntentMutation(value.email)
        await transaction.isPersisted.promise
        setOpen(false)
        const { error } = await authClient.signIn.magicLink({
          email: value.email,
          callbackURL: `${WEB_BASE_URL}/auth/confirm?authIntentId=${intentId}`,
        })

        if (error) {
          toast({
            description: "Invite created, but sending the email failed. Please retry from the members list.",
          })
        } else {
          toast({ description: "Invitation sent" })
        }
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
      }
    },
  })

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      title="Add New Member"
      description="Invite a new member to this organization by email."
      footer={
        <>
          <CloseTrigger />
          <Button
            type="button"
            disabled={form.state.isSubmitting}
            onClick={() => {
              void form.handleSubmit()
            }}
          >
            Send invite
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
          <form.Field name="email">
            {(field) => (
              <Input
                required
                type="email"
                label="Email"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="jon@latitude.so"
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}

function MembersTable({ members }: { members: MemberRecord[] }) {
  const { toast } = useToast()

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Confirmed</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id} verticalPadding hoverable={false}>
            <TableCell>
              <Text.H5>{member.name ?? "-"}</Text.H5>
            </TableCell>
            <TableCell>
              <Text.H5 color="foregroundMuted">{member.email}</Text.H5>
            </TableCell>
            <TableCell>
              {member.status === "invited" ? (
                <Text.H5 color="warningMutedForeground">Invited</Text.H5>
              ) : (
                <Text.H5 color="foregroundMuted">{relativeTime(member.confirmedAt)}</Text.H5>
              )}
            </TableCell>
            <TableCell align="right">
              {(member.status === "active" || member.status === "invited") && (
                <Button
                  flat
                  variant="ghost"
                  onClick={() => {
                    const transaction =
                      member.status === "invited"
                        ? cancelMemberInviteMutation(member.id)
                        : removeMemberMutation(member.id)

                    void transaction.isPersisted.promise
                      .then(() => {
                        toast({
                          description: member.status === "invited" ? "Invitation canceled" : "Member removed",
                        })
                      })
                      .catch((e) =>
                        toast({
                          variant: "destructive",
                          description: toUserMessage(e),
                        }),
                      )
                  }}
                >
                  <Icon icon={Trash2} size="sm" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MembershipsSection() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const { data, isLoading } = useMembersCollection()
  const members = data ?? []

  return (
    <div className="flex flex-col gap-4">
      <InviteMemberModal open={inviteOpen} setOpen={setInviteOpen} />
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-2">
          <Text.H4 weight="bold">Organization Members</Text.H4>
        </div>
        <Button flat variant="outline" onClick={() => setInviteOpen(true)}>
          Add Member
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {isLoading && <TableSkeleton cols={4} rows={3} />}
        {!isLoading && members.length > 0 && <MembersTable members={members} />}
      </div>
    </div>
  )
}

// --- API Keys Section ---

function CreateApiKeyModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await createApiKey({ data: { name: value.name } })
        setOpen(false)
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
      }
    },
  })

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      title="Create API Key"
      description="Create a new API key for your organization to access the Latitude API."
      footer={
        <>
          <CloseTrigger />
          <Button
            type="submit"
            onClick={() => {
              void form.handleSubmit()
            }}
          >
            Create API Key
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
      </form>
    </Modal>
  )
}

function UpdateApiKeyModal({ apiKey, onClose }: { apiKey: ApiKeyRecord; onClose: () => void }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: {
      name: apiKey.name ?? "",
    },
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
    <Modal
      open
      dismissible
      onOpenChange={onClose}
      title="Update API Key"
      description="Update the name for your API key."
      footer={
        <>
          <CloseTrigger />
          <Button
            type="submit"
            onClick={() => {
              void form.handleSubmit()
            }}
          >
            Update API Key
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
                type="text"
                label="Name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="API key name"
              />
            )}
          </form.Field>
        </FormWrapper>
      </form>
    </Modal>
  )
}

function ApiKeysTable({ apiKeys }: { apiKeys: ApiKeyRecord[] }) {
  const { toast } = useToast()
  const [apiKeyToEdit, setApiKeyToEdit] = useState<ApiKeyRecord | null>(null)

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>API Key</TableHead>
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
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      flat
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(apiKey.token)
                        toast({
                          title: "Copied to clipboard",
                        })
                      }}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <Text.H5 color="foregroundMuted">
                          {apiKey.token.length > 7
                            ? `${apiKey.token.slice(0, 3)}********${apiKey.token.slice(-4)}`
                            : "********"}
                        </Text.H5>
                        <Icon icon={Clipboard} size="sm" color="foregroundMuted" />
                      </div>
                    </Button>
                  }
                >
                  Click to copy
                </Tooltip>
              </TableCell>
              <TableCell align="right">
                <div className="flex flex-row items-center gap-1">
                  <Tooltip
                    asChild
                    trigger={
                      <Button flat variant="ghost" onClick={() => setApiKeyToEdit(apiKey)}>
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
                        flat
                        disabled={apiKeys.length === 1}
                        variant="ghost"
                        onClick={() => {
                          void deleteApiKeyMutation(apiKey.id).isPersisted.promise
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

      {apiKeyToEdit && <UpdateApiKeyModal apiKey={apiKeyToEdit} onClose={() => setApiKeyToEdit(null)} />}
    </>
  )
}

function ApiKeysSection() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useApiKeysCollection()
  const apiKeys = data ?? []

  return (
    <>
      <CreateApiKeyModal open={createOpen} setOpen={setCreateOpen} />
      <TableWithHeader
        title={
          <div className="flex flex-row items-center gap-2">
            <Text.H4 weight="bold">API Keys</Text.H4>
          </div>
        }
        actions={
          <Button flat variant="outline" onClick={() => setCreateOpen(true)}>
            Create API Key
          </Button>
        }
        table={isLoading ? <TableSkeleton cols={3} rows={3} /> : <ApiKeysTable apiKeys={apiKeys} />}
      />
    </>
  )
}

function SettingsPage() {
  return (
    <Container>
      <OrganizationSection />
      <MembershipsSection />
      <ApiKeysSection />
    </Container>
  )
}
