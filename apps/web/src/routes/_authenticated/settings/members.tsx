import {
  Avatar,
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
  Status,
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
import { ChevronDown, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  cancelMemberInviteMutation,
  inviteMemberMutation,
  removeMemberMutation,
  transferOwnershipMutation,
  updateMemberRoleMutation,
  useMembersCollection,
} from "../../../domains/members/members.collection.ts"
import type { MemberRecord } from "../../../domains/members/members.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { useAuthenticatedUser } from "../-route-data.ts"
import { SettingsPageHeader } from "./-components/settings-page-header.tsx"

export const Route = createFileRoute("/_authenticated/settings/members")({
  component: MembersSettingsRoutePage,
})

function MembersSettingsRoutePage() {
  return <MembersSettingsPanel />
}

function InviteMemberModal({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { toast } = useToast()
  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      try {
        await inviteMemberMutation(value.email)
        setOpen(false)
        toast({ description: "Invitation sent" })
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
    (member) => member.status === "active" && member.userId !== currentUserId && member.userId !== null,
  )
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const memberOptions = eligibleMembers.map((member) => ({
    label: `${member.name ?? member.email} (${member.email})`,
    value: member.userId ?? "",
  }))

  const handleTransfer = async () => {
    if (!selectedMemberId) return

    try {
      await transferOwnershipMutation(selectedMemberId)
      setOpen(false)
      toast({ description: "Ownership transferred successfully. You are now an admin." })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

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

  const isExpired = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const handleRoleSelect = async (member: MemberRecord, newRole: "admin" | "member") => {
    if (!member.userId || member.role === newRole) return
    try {
      await updateMemberRoleMutation(member.userId, newRole)
      toast({ description: `Role updated to ${newRole}` })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const invitationStatus = (member: MemberRecord) => {
    if (member.status === "invited") {
      if (member.expiresAt && isExpired(member.expiresAt)) {
        return { variant: "expired" as const, label: "Expired" }
      }
      return { variant: "pending" as const, label: "Pending" }
    }
    return { variant: "accepted" as const, label: "Accepted" }
  }

  const canChangeRole = (member: MemberRecord) => {
    if (!isAdmin) return false
    if (member.userId === currentUserId) return false
    if (member.role === "owner") return false
    if (member.status !== "active") return false
    return true
  }

  /** Owner can open menu to transfer; admins can change others' admin/member roles. */
  const canOpenRoleMenu = (member: MemberRecord) => (member.role === "owner" && isOwner) || canChangeRole(member)

  return (
    <>
      <TransferOwnershipModal
        open={transferOpen}
        setOpen={setTransferOpen}
        members={members}
        currentUserId={currentUserId}
      />
      <Table variant="listing">
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invitation status</TableHead>
            {isAdmin ? <TableHead align="right" className="w-14 min-w-14" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const inv = invitationStatus(member)
            return (
              <TableRow key={member.id} hoverable={false}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={member.name?.trim() ? member.name : member.email}
                      size="sm"
                      {...(member.image ? { imageSrc: member.image } : {})}
                    />
                    <Text.H5 ellipsis noWrap className="min-w-0">
                      {member.name ?? "—"}
                    </Text.H5>
                  </div>
                </TableCell>
                <TableCell>
                  <Text.H5 color="foregroundMuted" className="truncate" noWrap ellipsis>
                    {member.email}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <DropdownMenuRoot>
                    <DropdownMenuTrigger asChild disabled={!canOpenRoleMenu(member)}>
                      <button
                        type="button"
                        disabled={!canOpenRoleMenu(member)}
                        className="flex min-w-0 max-w-full items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                      >
                        <Text.H5
                          className="min-w-0 capitalize"
                          color={canOpenRoleMenu(member) ? "foreground" : "foregroundMuted"}
                        >
                          {member.role}
                        </Text.H5>
                        <Icon icon={ChevronDown} size="sm" className="shrink-0 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    {canOpenRoleMenu(member) ? (
                      <DropdownMenuContent align="start" className="w-48">
                        {member.role === "owner" && isOwner ? (
                          <DropdownMenuItem onSelect={() => setTransferOpen(true)}>Transfer ownership</DropdownMenuItem>
                        ) : null}
                        {canChangeRole(member) ? (
                          <>
                            <DropdownMenuItem
                              disabled={member.role === "admin"}
                              onSelect={() => void handleRoleSelect(member, "admin")}
                            >
                              Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={member.role === "member"}
                              onSelect={() => void handleRoleSelect(member, "member")}
                            >
                              Member
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    ) : null}
                  </DropdownMenuRoot>
                </TableCell>
                <TableCell>
                  <Status variant={inv.variant} label={inv.label} />
                </TableCell>
                {isAdmin ? (
                  <TableCell align="right" className="w-14 max-w-none min-w-14 shrink-0">
                    {member.status === "active" || member.status === "invited" ? (
                      <Tooltip
                        asChild
                        trigger={
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
                                .catch((error) => {
                                  toast({ variant: "destructive", description: toUserMessage(error) })
                                })
                            }}
                          >
                            <Icon icon={Trash2} size="sm" />
                          </Button>
                        }
                      >
                        {member.status === "invited" ? "Cancel invitation" : "Remove member"}
                      </Tooltip>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </>
  )
}

export function MembersSettingsPanel() {
  const user = useAuthenticatedUser()
  const [inviteOpen, setInviteOpen] = useState(false)
  const { data, isLoading } = useMembersCollection()
  const members = data ?? []
  const currentUserMembership = members.find((member) => member.userId === user.id)
  const isOwner = currentUserMembership?.role === "owner"
  const isAdmin = isOwner || currentUserMembership?.role === "admin"

  return (
    <Container className="flex flex-col gap-8 p-6">
      <InviteMemberModal open={inviteOpen} setOpen={setInviteOpen} />
      <div className="flex flex-row items-start justify-between gap-4">
        <SettingsPageHeader
          className="min-w-0 flex-1"
          title="Members"
          description="Invite teammates and manage roles in your organization."
        />
        {isAdmin ? (
          <Button variant="outline" className="shrink-0" onClick={() => setInviteOpen(true)}>
            Add Member
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {isLoading ? <TableSkeleton cols={5} rows={3} variant="listing" /> : null}
        {!isLoading && members.length > 0 ? (
          <MembersTable members={members} currentUserId={user.id} isOwner={isOwner} isAdmin={isAdmin} />
        ) : null}
      </div>
    </Container>
  )
}
