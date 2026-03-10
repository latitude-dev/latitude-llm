import { Button, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { CheckCircle, Loader2, Terminal, XCircle } from "lucide-react"
import { useState } from "react"
import { exchangeCliSession } from "../../domains/auth/auth.functions.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"

export const Route = createFileRoute("/auth/cli")({
  validateSearch: (search: Record<string, unknown>) => ({
    session: (search.session as string) ?? "",
  }),
  beforeLoad: async ({ search }) => {
    const userSession = await getSession()
    if (!userSession) {
      throw redirect({
        to: "/login",
        search: { cliSession: search.session },
      })
    }
  },
  component: CliAuthPage,
})

type PageState =
  | { step: "confirm" }
  | { step: "authorizing" }
  | { step: "authorized" }
  | { step: "error"; message: string }

function CliAuthPage() {
  const { session: sessionToken } = Route.useSearch()
  const navigate = useNavigate()
  const [state, setState] = useState<PageState>({ step: "confirm" })

  if (!sessionToken) {
    void navigate({ to: "/" })
    return null
  }

  const handleAuthorize = async () => {
    setState({ step: "authorizing" })
    try {
      await exchangeCliSession({ data: { sessionToken } })
      setState({ step: "authorized" })
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to authorize CLI",
      })
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col items-center justify-center gap-6 max-w-[22rem] w-full">
        <LatitudeLogo />

        {state.step === "error" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Icon icon={XCircle} className="h-6 w-6 text-destructive" />
            </div>
            <Text.H3 align="center">Authorization failed</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {state.message}
            </Text.H5>
            <Button variant="ghost" onClick={() => setState({ step: "confirm" })}>
              Try again
            </Button>
          </div>
        ) : state.step === "authorized" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon icon={CheckCircle} className="h-6 w-6 text-primary" />
            </div>
            <Text.H3 align="center">CLI authorized</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              You can close this tab and return to your terminal.
            </Text.H5>
          </div>
        ) : state.step === "authorizing" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon icon={Loader2} className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
            <Text.H3 align="center">Authorizing...</Text.H3>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Icon icon={Terminal} className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Text.H3 align="center">Authorize CLI access</Text.H3>
              <Text.H5 color="foregroundMuted" align="center">
                An API key will be created for your active workspace and sent to your terminal.
              </Text.H5>
            </div>
            <Button size="full" onClick={handleAuthorize}>
              Authorize
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
