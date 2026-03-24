import { Button, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { AlertCircle, Users } from "lucide-react"
import { useState } from "react"
import z from "zod"
import { getInvitationPreview } from "../../domains/auth/auth.functions.ts"
import { getSession, updateUserName } from "../../domains/sessions/session.functions.ts"
import { authClient } from "../../lib/auth-client.ts"
import { toUserMessage } from "../../lib/errors.ts"

const invitationSearchParams = z.object({
  invitationId: z.string(),
})

export const Route = createFileRoute("/auth/invite")({
  validateSearch: invitationSearchParams,
  beforeLoad: async ({ search }) => {
    const preview = await getInvitationPreview({ data: { invitationId: search.invitationId } })
    if (!preview) {
      throw redirect({ to: "/" })
    }

    const session = await getSession().catch(() => null)
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: `/auth/invite?invitationId=${search.invitationId}`,
          email: preview.inviteeEmail,
        },
      })
    }

    return { invitationPreview: preview, session }
  },
  component: InvitePage,
})

function InvitePage() {
  const { invitationId } = Route.useSearch()
  const { invitationPreview, session } = Route.useRouteContext()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [name, setName] = useState("")

  const userHasName = session.user.name && session.user.name.trim().length > 0

  const handleAcceptInvitation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(undefined)

    try {
      if (!userHasName && name.trim()) {
        await updateUserName({ data: { name: name.trim() } })
      }

      const { error } = await authClient.organization.acceptInvitation({ invitationId })
      if (error) {
        setError(error.message)
        setIsSubmitting(false)
        return
      }
      await router.navigate({ to: "/" })
    } catch (err) {
      setError(toUserMessage(err))
      setIsSubmitting(false)
    }
  }

  const handleRejectInvitation = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(undefined)

    try {
      const { error } = await authClient.organization.rejectInvitation({ invitationId })
      if (error) {
        setError(error.message)
        setIsSubmitting(false)
        return
      }
      await router.navigate({ to: "/" })
    } catch (err) {
      setError(toUserMessage(err))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col gap-y-6 max-w-[22rem] w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Join organization</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              You've been invited to join an organization
            </Text.H5>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon icon={Users} className="h-6 w-6 text-primary" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <Text.H5 weight="medium">{invitationPreview.organizationName}</Text.H5>
            <Text.H6 color="foregroundMuted">Invited by {invitationPreview.inviterName}</Text.H6>
          </div>

          <form onSubmit={handleAcceptInvitation} className="flex flex-col gap-4">
            {!userHasName && (
              <label htmlFor="name" className="flex flex-col gap-2">
                <Text.H6 weight="medium">Your name</Text.H6>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Ex.: John Doe"
                  required
                  autoComplete="name"
                  data-autofocus="true"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Icon icon={AlertCircle} className="h-4 w-4" />
                <Text.H6 color="destructive">{error}</Text.H6>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                size="full"
                type="submit"
                disabled={isSubmitting}
                className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-[1px] active:shadow-none transition-all"
              >
                {isSubmitting ? "Accepting…" : "Accept invitation"}
              </Button>

              <Button
                variant="ghost"
                type="button"
                disabled={isSubmitting}
                onClick={handleRejectInvitation}
                className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
              >
                Decline invitation
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
