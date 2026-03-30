import {
  Button,
  CloseTrigger,
  Container,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  FormWrapper,
  Icon,
  Input,
  Label,
  Modal,
  Select,
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
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useRouteContext, useRouter } from "@tanstack/react-router"
import { ChevronDown, Clipboard, Pencil, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  deleteApiKeyMutation,
  updateApiKeyMutation,
  useApiKeysCollection,
} from "../../domains/api-keys/api-keys.collection.ts"
import { type ApiKeyRecord, createApiKey } from "../../domains/api-keys/api-keys.functions.ts"
import { setActiveOrganization } from "../../domains/auth/auth.functions.ts"
import {
  cancelMemberInviteMutation,
  inviteMemberMutation,
  removeMemberMutation,
  useMembersCollection,
} from "../../domains/members/members.collection.ts"
import type { MemberRecord } from "../../domains/members/members.functions.ts"
import { transferOwnership, updateMemberRole } from "../../domains/members/members.functions.ts"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../domains/organizations/organizations.collection.ts"
import { createOrganization } from "../../domains/organizations/organizations.functions.ts"
import { deleteCurrentUser, updateUserName } from "../../domains/sessions/session.functions.ts"
import { authClient } from "../../lib/auth-client.ts"
import { toUserMessage } from "../../lib/errors.ts"

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
})

function OrganizationSection() {
  const { organizationId } = useRouteContext({ from: "/_authenticated/settings" })
  const { toast } = useToast()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const saveField = useCallback(
    (patch: { name?: string; settings?: { keepMonitoring: boolean } }) => {
      if (!org) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateOrganizationMutation(org.id, patch)
        toast({ description: patch.name ? "Organization name updated" : "Monitoring preference updated" })
      }, 600)
    },
    [org, toast],
  )

  if (!org) return null

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <Text.H4 weight="bold">Organization settings</Text.H4>
      <Input
        required
        type="text"
        label="Organization Name"
        defaultValue={org.name}
        onChange={(e) => saveField({ name: e.target.value })}
        placeholder="Organization name"
      />
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <Label htmlFor="keep-monitoring">Keep monitoring after resolution</Label>
          <Text.H6 color="foregroundMuted">
            When enabled, linked evaluations stay active after an issue is resolved to detect regressions.
          </Text.H6>
        </div>
        <Switch
          id="keep-monitoring"
          checked={org.settings?.keepMonitoring ?? true}
          onCheckedChange={(checked) => saveField({ settings: { keepMonitoring: checked } })}
        />
      </div>
    </div>
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
        await inviteMemberMutation(value.email)
        setOpen(false)
        toast({ description: "Invitation sent" })
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
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
          <Modal.Header title="Add New Member" description="Invite a new member to this organization by email." />
          <Modal.Body>
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
          </Modal.Body>
          <Modal.Footer>
            <Button type="submit" disabled={form.state.isSubmitting}>
              Send invite
            </Button>
            <CloseTrigger />
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}

function TransferOwnershipModal({
  open,
  setOpen,
  members,
  currentUserId,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  members: MemberRecord[]
  currentUserId: string
}) {
  const { toast } = useToast()
  const eligibleMembers = members.filter(
    (m) => m.status === "active" && m.userId !== currentUserId && m.userId !== null,
  )

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const handleTransfer = async () => {
    if (!selectedMemberId) return

    try {
      await transferOwnership({ data: { newOwnerUserId: selectedMemberId } })
      setOpen(false)
      toast({ description: "Ownership transferred successfully. You are now an admin." })
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    }
  }

  const memberOptions = eligibleMembers.map((member) => ({
    label: `${member.name ?? member.email} (${member.email})`,
    value: member.userId ?? "",
  }))

  return (
    <Modal.Root open={open} onOpenChange={setOpen}>
      <Modal.Content dismissible>
        <Modal.Header
          title="Transfer Ownership"
          description="Transfer ownership of this organization to another member. You will become an admin after the transfer."
        />
        <Modal.Body>
          <FormWrapper>
            {eligibleMembers.length === 0 ? (
              <Text.H5 color="foregroundMuted">
                No eligible members to transfer ownership to. Add more members first.
              </Text.H5>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Select new owner</Label>
                <Select
                  name="newOwner"
                  options={memberOptions}
                  value={selectedMemberId ?? undefined}
                  onChange={(value) => setSelectedMemberId(value)}
                  placeholder="Select a member..."
                  searchable
                  searchPlaceholder="Search members..."
                  searchableEmptyMessage="No members found"
                />
              </div>
            )}
          </FormWrapper>
        </Modal.Body>
        <Modal.Footer>
          <CloseTrigger />
          <Button
            type="button"
            disabled={eligibleMembers.length === 0 || !selectedMemberId}
            onClick={() => void handleTransfer()}
          >
            Transfer Ownership
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  )
}

function ChangeRoleModal({
  open,
  setOpen,
  member,
  onRoleChange,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  member: MemberRecord | null
  onRoleChange: (targetUserId: string, newRole: "admin" | "member") => Promise<void>
}) {
  const { toast } = useToast()
  const [selectedRole, setSelectedRole] = useState<"admin" | "member" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-select current role when modal opens
  useEffect(() => {
    if (open && member?.role === "admin") {
      setSelectedRole("admin")
    } else if (open && member?.role === "member") {
      setSelectedRole("member")
    } else if (!open) {
      setSelectedRole(null)
    }
  }, [open, member])

  const handleSubmit = async () => {
    if (!member?.userId || !selectedRole) return

    setIsSubmitting(true)
    try {
      await onRoleChange(member.userId, selectedRole)
      setOpen(false)
      toast({ description: `Role updated to ${selectedRole}` })
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!member) return null

  return (
    <Modal.Root open={open} onOpenChange={setOpen}>
      <Modal.Content dismissible>
        <Modal.Header title="Change Member Role" description={`Update the role for ${member.name ?? member.email}`} />
        <Modal.Body>
          <FormWrapper>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Select new role</Label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 p-3 rounded border hover:bg-muted cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={selectedRole === "admin"}
                      onChange={(e) => setSelectedRole(e.target.value as "admin")}
                      className="h-4 w-4"
                    />
                    <div className="flex flex-col">
                      <Text.H5>Admin</Text.H5>
                      <Text.H6 color="foregroundMuted">Can manage members and organization settings</Text.H6>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 p-3 rounded border hover:bg-muted cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="member"
                      checked={selectedRole === "member"}
                      onChange={(e) => setSelectedRole(e.target.value as "member")}
                      className="h-4 w-4"
                    />
                    <div className="flex flex-col">
                      <Text.H5>Member</Text.H5>
                      <Text.H6 color="foregroundMuted">Standard member with limited permissions</Text.H6>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </FormWrapper>
        </Modal.Body>
        <Modal.Footer>
          <CloseTrigger />
          <Button type="button" disabled={!selectedRole || isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? "Updating..." : "Update Role"}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  )
}

function MembersTable({
  members,
  currentUserId,
  isOwner,
  isAdmin,
}: {
  members: MemberRecord[]
  currentUserId: string
  isOwner: boolean
  isAdmin: boolean
}) {
  const { toast } = useToast()
  const [transferOpen, setTransferOpen] = useState(false)
  const [changeRoleOpen, setChangeRoleOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null)

  const isExpired = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const handleRoleChange = async (targetUserId: string, newRole: "admin" | "member") => {
    try {
      await updateMemberRole({ data: { targetUserId, newRole } })
      toast({ description: `Role updated to ${newRole}` })
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    }
  }

  const canChangeRole = (member: MemberRecord) => {
    // Only admins can change roles
    if (!isAdmin) return false
    // Cannot change own role
    if (member.userId === currentUserId) return false
    // Cannot change owner's role
    if (member.role === "owner") return false
    // Can only change active members
    if (member.status !== "active") return false
    return true
  }

  const openChangeRoleModal = (member: MemberRecord) => {
    setSelectedMember(member)
    setChangeRoleOpen(true)
  }

  return (
    <>
      <TransferOwnershipModal
        open={transferOpen}
        setOpen={setTransferOpen}
        members={members}
        currentUserId={currentUserId}
      />
      <ChangeRoleModal
        open={changeRoleOpen}
        setOpen={setChangeRoleOpen}
        member={selectedMember}
        onRoleChange={handleRoleChange}
      />
      <Table>
        <TableHeader>
          <TableRow verticalPadding>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Invitation</TableHead>
            {isAdmin && <TableHead />}
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
                <div className="flex items-center gap-2">
                  {(member.role === "owner" && isOwner) || canChangeRole(member) ? (
                    <DropdownMenuRoot>
                      <DropdownMenuTrigger asChild>
                        <div className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 py-1 rounded transition-colors">
                          <Text.H5 color="foregroundMuted">{member.role}</Text.H5>
                          <Icon icon={ChevronDown} size="sm" className="text-muted-foreground" />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-0">
                        {member.role === "owner" && isOwner && (
                          <DropdownMenuItem onSelect={() => setTransferOpen(true)}>Transfer ownership</DropdownMenuItem>
                        )}
                        {canChangeRole(member) && (
                          <DropdownMenuItem onSelect={() => openChangeRoleModal(member)}>Change role</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenuRoot>
                  ) : (
                    <Text.H5 color="foregroundMuted">{member.role}</Text.H5>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Text.H5 color={member.status === "invited" ? "warningMutedForeground" : "foregroundMuted"}>
                  {member.status === "invited" ? "Pending" : "Active"}
                </Text.H5>
              </TableCell>
              <TableCell>
                {member.status === "invited" ? (
                  member.expiresAt && isExpired(member.expiresAt) ? (
                    <Text.H5 color="destructive">Expired</Text.H5>
                  ) : member.expiresAt ? (
                    <Text.H5 color="foregroundMuted">{relativeTime(member.expiresAt)}</Text.H5>
                  ) : (
                    <Text.H5 color="foregroundMuted">No expiration</Text.H5>
                  )
                ) : (
                  <Text.H5 color="foregroundMuted">-</Text.H5>
                )}
              </TableCell>
              <TableCell align="right">
                {isAdmin && (member.status === "active" || member.status === "invited") && (
                  <Button
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
    </>
  )
}

function MembershipsSection() {
  const { user } = Route.useRouteContext()
  const [inviteOpen, setInviteOpen] = useState(false)
  const { data, isLoading } = useMembersCollection()
  const members = data ?? []

  const currentUserMembership = members.find((m) => m.userId === user.id)
  const isOwner = currentUserMembership?.role === "owner"
  const isAdmin = isOwner || currentUserMembership?.role === "admin"

  return (
    <div className="flex flex-col gap-4">
      <InviteMemberModal open={inviteOpen} setOpen={setInviteOpen} />
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-2">
          <Text.H4 weight="bold">Organization Members</Text.H4>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            Add Member
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {isLoading && <TableSkeleton cols={4} rows={3} />}
        {!isLoading && members.length > 0 && (
          <MembersTable members={members} currentUserId={user.id} isOwner={isOwner} isAdmin={isAdmin} />
        )}
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
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            Create API Key
          </Button>
        }
        table={isLoading ? <TableSkeleton cols={3} rows={3} /> : <ApiKeysTable apiKeys={apiKeys} />}
      />
    </>
  )
}

// --- Profile Section (from user-settings) ---

function ProfileSection() {
  const { user } = Route.useRouteContext()
  const { toast } = useToast()
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [name, setName] = useState(user.name ?? "")

  const saveField = useCallback(
    (newName: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          await updateUserName({ data: { name: newName } })
          toast({ description: "Name updated" })
          void router.invalidate()
        } catch (error) {
          toast({
            variant: "destructive",
            description: toUserMessage(error),
          })
        }
      }, 600)
    },
    [toast, router],
  )

  const handleChange = (newName: string) => {
    setName(newName)
    saveField(newName)
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Text.H4 weight="bold">User settings</Text.H4>
      <Input
        required
        type="text"
        label="Your Name"
        value={name}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Your name"
      />
    </div>
  )
}

// --- Create Organization Section (from user-settings) ---

function CreateOrganizationModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const org = await createOrganization({ data: { name: value.name } })
        toast({ description: "Organization created" })
        form.reset()
        await setActiveOrganization({
          data: {
            organizationId: org.id,
            organizationSlug: org.slug,
          },
        })
        setOpen(false)
        window.location.href = "/"
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
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
            title="Create Organization"
            description="Create a new organization to manage your projects and team members."
          />
          <Modal.Body>
            <FormWrapper>
              <form.Field name="name">
                {(field) => (
                  <Input
                    required
                    type="text"
                    label="Organization Name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="My Organization"
                  />
                )}
              </form.Field>
            </FormWrapper>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button type="submit" disabled={form.state.isSubmitting}>
              Create
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  )
}

function CreateOrganizationSection() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
      <Text.H4 weight="bold" color="primary">
        Create Organization
      </Text.H4>
      <Text.H5 color="primary">Create a new organization to manage your projects and team members.</Text.H5>
      <CreateOrganizationModal open={modalOpen} setOpen={setModalOpen} />
      <div>
        <Button onClick={() => setModalOpen(true)}>Create Organization</Button>
      </div>
    </div>
  )
}

// --- Delete Account Section (from user-settings) ---

function DeleteAccountConfirmModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const router = useRouter()
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const expectedText = "delete my account"
  const isConfirmed = confirmText.toLowerCase() === expectedText

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteCurrentUser()
      await authClient.signOut()
      void router.navigate({ to: "/login" })
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmText("")
        setOpen(v)
      }}
      title="Delete Account"
      description="This action is permanent and cannot be undone. All your data will be deleted. If you are the sole member of an organization, that organization will also be permanently deleted."
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!isConfirmed || isDeleting} onClick={() => void handleDelete()}>
            {isDeleting ? "Deleting..." : "Delete Account"}
          </Button>
        </>
      }
    >
      <FormWrapper>
        <Input
          type="text"
          label={`Type "${expectedText}" to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={expectedText}
        />
      </FormWrapper>
    </Modal>
  )
}

function DeleteAccountSection() {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <Text.H4 weight="bold" color="destructive">
        Delete Account
      </Text.H4>
      <Text.H5 color="destructive">
        Permanently delete your account and all associated data. If you are the sole member of an organization, that
        organization will also be deleted.
      </Text.H5>
      <div>
        <DeleteAccountConfirmModal open={confirmOpen} setOpen={setConfirmOpen} />
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Delete Account
        </Button>
      </div>
    </div>
  )
}

function SettingsPage() {
  return (
    <Container className="flex flex-col gap-8 pt-14">
      {/* Organization Settings */}
      <OrganizationSection />
      <MembershipsSection />
      <ApiKeysSection />

      {/* User Settings */}
      <div className="flex flex-col gap-8">
        <ProfileSection />
        <CreateOrganizationSection />
        <DeleteAccountSection />
      </div>
    </Container>
  )
}
