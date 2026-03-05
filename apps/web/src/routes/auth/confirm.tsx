import { Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { CheckCircle, Loader2, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { completeAuthIntent } from "../../domains/auth/auth.functions.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: (search: Record<string, unknown>) => ({
    authIntentId: (search.authIntentId as string) ?? "",
  }),
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login" })
    }
  },
  component: AuthConfirmPage,
})

function AuthConfirmPage() {
  const { authIntentId } = Route.useSearch()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    if (!authIntentId) {
      void navigate({ to: "/" })
      return
    }

    completeAuthIntent({ data: { intentId: authIntentId } })
      .then(() => {
        setCompleted(true)
        setTimeout(() => {
          void navigate({ to: "/" })
        }, 2000)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to complete authentication")
      })
  }, [authIntentId, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col items-center justify-center gap-6 max-w-[22rem] w-full">
        <LatitudeLogo />

        {error ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Icon icon={XCircle} className="h-6 w-6 text-destructive" />
            </div>
            <Text.H3 align="center">Something went wrong</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {error}
            </Text.H5>
          </div>
        ) : completed ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon icon={CheckCircle} className="h-6 w-6 text-primary" />
            </div>
            <Text.H3 align="center">You're in!</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              In a few seconds you will be redirected to your workspace.
            </Text.H5>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon icon={Loader2} className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
            <Text.H3 align="center">Setting up your workspace</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              Please wait while we complete your authentication...
            </Text.H5>
          </div>
        )}
      </div>
    </div>
  )
}
