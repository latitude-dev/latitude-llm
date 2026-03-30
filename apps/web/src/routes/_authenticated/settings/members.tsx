import {
  Button,
  CloseTrigger,
  Container,
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
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import {
  cancelMemberInviteMutation,
  inviteMemberMutation,
  removeMemberMutation,
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

function MembersTable({ members }: { members: MemberRecord[] }) {
  const { toast } = useToast()

  const isExpired = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow verticalPadding>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Invitation</TableHead>
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
              <Text.H5 color="foregroundMuted">{member.role}</Text.H5>
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
              {(member.status === "active" || member.status === "invited") && (
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
                      .catch((e) => toast({ variant: "destructive", description: toUserMessage(e) }))
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

function MembersSettingsPage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const { data, isLoading } = useMembersCollection()
  const members = data ?? []

  return (
    <Container className="flex flex-col gap-8 pt-14">
      <InviteMemberModal open={inviteOpen} setOpen={setInviteOpen} />
      <div className="flex flex-row items-center justify-between">
        <Text.H4 weight="bold">Members</Text.H4>
        <Button variant="outline" onClick={() => setInviteOpen(true)}>
          Add Member
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {isLoading && <TableSkeleton cols={4} rows={3} />}
        {!isLoading && members.length > 0 && <MembersTable members={members} />}
      </div>
    </Container>
  )
}
