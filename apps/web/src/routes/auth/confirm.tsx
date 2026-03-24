import { Button, Icon, LatitudeLogo, Text, useMountEffect } from "@repo/ui"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { CheckCircle, Loader2, XCircle } from "lucide-react"
import { useState } from "react"
import type { AuthIntentInfo } from "../../domains/auth/auth.functions.ts"
import { getAuthIntentInfo } from "../../domains/auth/auth.functions.ts"
import { completeAuthIntentMutation } from "../../domains/auth/auth.mutations.ts"
import { getSession } from "../../domains/sessions/session.functions.ts"
import { toUserMessage } from "../../lib/errors.ts"

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: (search: Record<string, unknown>) => ({
    authIntentId: (search.authIntentId as string) ?? "",
    cliSession: (search.cliSession as string) || undefined,
    error: (search.error as string) || undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (search.error) {
      return {
        intentInfo: null,
        authIntentId: search.authIntentId,
        cliSession: search.cliSession,
        initialError: toMagicLinkErrorMessage(search.error),
      }
    }

    const session = await getSession()
    if (!session) {
      throw redirect({ to: "/login" })
    }

    if (!search.authIntentId) {
      throw redirect({ to: "/" })
    }

    try {
      const intentInfo = await getAuthIntentInfo({ data: { intentId: search.authIntentId } })
      return { intentInfo, authIntentId: search.authIntentId, cliSession: search.cliSession }
    } catch (err) {
      return {
        intentInfo: null,
        authIntentId: search.authIntentId,
        cliSession: search.cliSession,
        initialError: toUserMessage(err),
      }
    }
  },
  component: AuthConfirmPage,
})

const MAGIC_LINK_ERROR_MESSAGES = {
  ATTEMPTS_EXCEEDED: "This sign-in link was opened too many times. Please request a new one.",
  EXPIRED_TOKEN: "This sign-in link has expired. Please request a new one.",
  INVALID_TOKEN: "This sign-in link is invalid or has already been used. Please request a new one.",
} as const

function toMagicLinkErrorMessage(error: string) {
  return (
    MAGIC_LINK_ERROR_MESSAGES[error as keyof typeof MAGIC_LINK_ERROR_MESSAGES] ??
    "We could not verify this sign-in link. Please request a new one."
  )
}

type ConfirmState =
  | { step: "loading" }
  | { step: "name-form"; intentInfo: AuthIntentInfo }
  | { step: "completing" }
  | { step: "completed" }
  | { step: "error"; message: string }

function AuthConfirmPage() {
  const { intentInfo, authIntentId, cliSession, initialError } = Route.useRouteContext()
  const navigate = useNavigate()
  const shouldAutoComplete = !!intentInfo && !intentInfo.needsName
  const [state, setState] = useState<ConfirmState>(() => {
    if (initialError) return { step: "error", message: initialError }
    if (!intentInfo) return { step: "error", message: "Authentication intent could not be loaded." }
    if (intentInfo.needsName) return { step: "name-form", intentInfo }
    return { step: "completing" }
  })
  const [name, setName] = useState("")

  const completeAndRedirect = async (userName?: string) => {
    const transaction = completeAuthIntentMutation({ intentId: authIntentId, ...(userName ? { name: userName } : {}) })
    return transaction.isPersisted.promise
      .then(() => {
        setState({ step: "completed" })
        if (cliSession) {
          void navigate({ to: "/auth/cli", search: { session: cliSession } })
        } else {
          setTimeout(() => {
            void navigate({ to: "/" })
          }, 2000)
        }
      })
      .catch((err) => {
        setState({
          step: "error",
          message: toUserMessage(err),
        })
      })
  }

  const handleAutoComplete = () => {
    if (state.step !== "completing") return
    void completeAndRedirect()
  }

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setState({ step: "completing" })
    void completeAndRedirect(name.trim())
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col items-center justify-center gap-6 max-w-modal-sm w-full">
        <LatitudeLogo />

        {state.step === "error" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Icon icon={XCircle} className="h-6 w-6 text-destructive" />
            </div>
            <Text.H3 align="center">Something went wrong</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {state.message}
            </Text.H5>
          </div>
        ) : state.step === "completed" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon icon={CheckCircle} className="h-6 w-6 text-primary" />
            </div>
            <Text.H3 align="center">You're in!</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {cliSession
                ? "Redirecting to CLI authorization..."
                : "In a few seconds you will be redirected to your workspace."}
            </Text.H5>
          </div>
        ) : state.step === "name-form" ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <Text.H3 align="center">Welcome to Latitude</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {`You've been invited to join ${state.intentInfo.organizationName ?? "a workspace"}. Enter your name to continue.`}
            </Text.H5>
            <form onSubmit={handleNameSubmit} className="flex flex-col gap-4 w-full">
              <label htmlFor="name" className="flex flex-col gap-2">
                <Text.H6 weight="medium">Name</Text.H6>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </label>
              <Button size="full" type="submit" disabled={!name.trim()}>
                Join workspace
              </Button>
            </form>
          </div>
        ) : state.step === "completing" ? (
          shouldAutoComplete ? (
            <AutoCompleteAuthIntent onMount={handleAutoComplete} />
          ) : (
            <LoadingState />
          )
        ) : (
          <LoadingState />
        )}
      </div>
    </div>
  )
}

function AutoCompleteAuthIntent({ onMount }: { onMount: () => void }) {
  useMountEffect(() => {
    onMount()
  })

  return <LoadingState />
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon icon={Loader2} className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
      <Text.H3 align="center">Setting up your workspace</Text.H3>
      <Text.H5 color="foregroundMuted" align="center">
        Please wait while we complete your authentication...
      </Text.H5>
    </div>
  )
}
