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
import { relativeTime } from "@repo/utils"
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

export const Route = createFileRoute("/_authenticated/settings/members")({
  component: MembersSettingsPage,
})

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      if (member?.role === "admin") {
        setSelectedRole("admin")
      } else if (member?.role === "member") {
        setSelectedRole("member")
      }
    } else {
      setSelectedRole(null)
    }
    setOpen(nextOpen)
  }

  const handleSubmit = async () => {
    if (!member?.userId || !selectedRole) return

    setIsSubmitting(true)
    try {
      await onRoleChange(member.userId, selectedRole)
      setOpen(false)
      toast({ description: `Role updated to ${selectedRole}` })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!member) return null

  return (
    <Modal.Root open={open} onOpenChange={handleOpenChange}>
      <Modal.Content dismissible>
        <Modal.Header title="Change Member Role" description={`Update the role for ${member.name ?? member.email}`} />
        <Modal.Body>
          <FormWrapper>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Select new role</Label>
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded border p-3 hover:bg-muted">
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
                  <label className="flex cursor-pointer items-center gap-2 rounded border p-3 hover:bg-muted">
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
      await updateMemberRoleMutation(targetUserId, newRole)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      throw error
    }
  }

  const canChangeRole = (member: MemberRecord) => {
    if (!isAdmin) return false
    if (member.userId === currentUserId) return false
    if (member.role === "owner") return false
    if (member.status !== "active") return false
    return true
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
                        <div className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted">
                          <Text.H5 color="foregroundMuted">{member.role}</Text.H5>
                          <Icon icon={ChevronDown} size="sm" className="text-muted-foreground" />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-0">
                        {member.role === "owner" && isOwner ? (
                          <DropdownMenuItem onSelect={() => setTransferOpen(true)}>Transfer ownership</DropdownMenuItem>
                        ) : null}
                        {canChangeRole(member) ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              setSelectedMember(member)
                              setChangeRoleOpen(true)
                            }}
                          >
                            Change role
                          </DropdownMenuItem>
                        ) : null}
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
                {isAdmin && (member.status === "active" || member.status === "invited") ? (
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}

function MembersSettingsPage() {
  const { user } = Route.useRouteContext()
  const [inviteOpen, setInviteOpen] = useState(false)
  const { data, isLoading } = useMembersCollection()
  const members = data ?? []
  const currentUserMembership = members.find((member) => member.userId === user.id)
  const isOwner = currentUserMembership?.role === "owner"
  const isAdmin = isOwner || currentUserMembership?.role === "admin"

  return (
    <Container className="flex flex-col gap-8 pt-14">
      <InviteMemberModal open={inviteOpen} setOpen={setInviteOpen} />
      <div className="flex flex-row items-center justify-between">
        <Text.H4 weight="bold">Members</Text.H4>
        {isAdmin ? (
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            Add Member
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {isLoading ? <TableSkeleton cols={6} rows={3} /> : null}
        {!isLoading && members.length > 0 ? (
          <MembersTable members={members} currentUserId={user.id} isOwner={isOwner} isAdmin={isAdmin} />
        ) : null}
      </div>
    </Container>
  )
}
