import { Button, GitHubIcon, GoogleIcon, Icon, Input, Text, useMountEffect } from "@repo/ui"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { AlertCircle, ArrowRight, Mail } from "lucide-react"
import { type SubmitEvent, useCallback, useRef, useState } from "react"
import z from "zod"
import { AuthScreen } from "../components/auth-screen.tsx"
import { Turnstile } from "../components/turnstile.tsx"
import { sendMagicLink } from "../domains/auth/auth.functions.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { lookupSsoForEmail } from "../domains/sso/sso.functions.ts"
import { clarityHeadScripts } from "../lib/analytics/clarity.ts"
import { appendTrackingParams, gtmHeadScripts, pickTrackingParams } from "../lib/analytics/gtm.ts"
import { setSignupAttributionCookie } from "../lib/analytics/signup-attribution-cookie.ts"
import { oauthCallbackErrorMessage } from "../lib/auth/oauth-errors.ts"
import { authClient } from "../lib/auth-client.ts"
import { TURNSTILE_SITE_KEY } from "../lib/auth-config.ts"
import { toUserMessage } from "../lib/errors.ts"
import { bootstrapPostHogAttributionSession, getPostHogSessionId } from "../lib/posthog/posthog-client.ts"

const loginSearchParams = z.object({
  redirect: z.string().optional(),
  email: z.string().optional(),
  // Better Auth appends `?error=<code>` to `errorCallbackURL` when a social
  // sign-in fails at the OAuth callback (e.g. `account_not_linked`).
  error: z.string().optional(),
})

const captureSignupAttribution = async (tracking: Record<string, string>) => {
  const sessionId = await getPostHogSessionId()
  return {
    ...(sessionId ? { sessionId } : {}),
    ...(window.document.referrer ? { referrer: window.document.referrer } : {}),
    ...(Object.keys(tracking).length > 0 ? { trackingParams: tracking } : {}),
  }
}

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchParams,
  beforeLoad: async () => {
    const session = await getSession()
    if (session) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({ scripts: [...gtmHeadScripts(), ...clarityHeadScripts()] }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectPath, email: prefilledEmail, error: oauthErrorCode } = Route.useSearch()
  useMountEffect(() => {
    void bootstrapPostHogAttributionSession()
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(() => oauthCallbackErrorMessage(oauthErrorCode))
  const [isSent, setIsSent] = useState(false)
  const [isRedirectingToSso, setIsRedirectingToSso] = useState(false)
  const [email, setEmail] = useState(prefilledEmail ?? "")
  const captchaTokenRef = useRef<string | undefined>(undefined)
  const handleCaptchaVerify = useCallback((token: string) => {
    captchaTokenRef.current = token
  }, [])
  const handleCaptchaExpire = useCallback(() => {
    captchaTokenRef.current = undefined
  }, [])

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return

    const formData = new FormData(e.currentTarget)
    const emailValue = String(formData.get("email") ?? "")
    setEmail(emailValue)

    setIsLoading(true)
    setError(undefined)

    const callbackURL = redirectPath ?? "/"
    const tracking = pickTrackingParams(window.location.search)
    const newUserCallbackURL = appendTrackingParams(redirectPath ?? "/welcome", {
      ...tracking,
      signup: "email",
    })

    // Capture session + referrer/UTM now; the magic link is verified later
    // (maybe cross-device) without this context. Server stashes it by email and
    // attaches to `UserSignedUp` so PostHog links the event to this session.
    const attribution = await captureSignupAttribution(tracking)

    try {
      // Verified enterprise SSO domains skip the magic link entirely and
      // hand the browser to the IdP (`signIn.sso` 302s through Better Auth).
      const ssoMatch = await lookupSsoForEmail({ data: { email: emailValue } })
      if (ssoMatch) {
        setIsRedirectingToSso(true)
        const { error: ssoError } = await authClient.signIn.sso({
          email: emailValue,
          callbackURL,
          newUserCallbackURL,
        })
        if (ssoError) {
          setIsRedirectingToSso(false)
          setError(ssoError.message ?? "Could not start SSO sign-in")
          setIsLoading(false)
        }
        // On success the client redirects the page — keep the loading state.
        return
      }

      await sendMagicLink({
        data: {
          email: emailValue,
          callbackURL,
          newUserCallbackURL,
          captchaToken: captchaTokenRef.current,
          ...(Object.keys(attribution).length > 0 ? { attribution } : {}),
        },
      })

      setIsSent(true)
      setIsLoading(false)
    } catch (err) {
      setError(toUserMessage(err))
      setIsLoading(false)
    }
  }

  const submitSocialSignIn = async (provider: "google" | "github") => {
    if (isLoading) return

    setIsLoading(true)
    setError(undefined)

    try {
      const tracking = pickTrackingParams(window.location.search)
      const attribution = await captureSignupAttribution(tracking)
      setSignupAttributionCookie(attribution)

      const startParams = new URLSearchParams(tracking)
      if (redirectPath) startParams.set("redirect", redirectPath)
      // Same-origin relative path — no baked deployment URL needed.
      const startUrl = `/api/auth/${provider}/start${startParams.toString() ? `?${startParams.toString()}` : ""}`
      window.location.assign(startUrl)
    } catch (err) {
      setError(toUserMessage(err))
      setIsLoading(false)
    }
  }

  const handleGoogleClick = () => {
    void submitSocialSignIn("google")
  }

  const handleGitHubClick = () => {
    void submitSocialSignIn("github")
  }

  if (isSent) {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon icon={Mail} className="h-6 w-6 text-primary" />
          </div>
          <Text.H3 align="center">Check your email</Text.H3>
          <Text.H5 color="foregroundMuted" align="center">
            We sent a link to <strong>{email}</strong>
          </Text.H5>
          <Text.H6 color="foregroundMuted" align="center">
            Click the link in the email to continue. The link will expire in 1 hour.
          </Text.H6>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setIsSent(false)
              setEmail("")
            }}
          >
            Use a different email
          </Button>
        </div>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen>
      <div className="flex flex-col items-center justify-center gap-y-1 -mt-2">
        <Text.H3 align="center">Welcome to Latitude</Text.H3>
        <a
          href="https://app.latitude.so"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 mt-1 bg-primary-muted hover:bg-primary-muted/80 transition-colors rounded-xl py-0.5 pl-3 pr-1.5"
        >
          <Text.H6 color="primary" weight="medium">
            Latitude V1 is still available, click to access
          </Text.H6>
          <Icon icon={ArrowRight} size="xs" color="primary" />
        </a>
      </div>

      <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            name="email"
            type="email"
            label="Email"
            placeholder="Ex.: jon@example.com"
            required
            autoComplete="email"
            data-autofocus="true"
            background="background"
            defaultValue={email}
          />

          {TURNSTILE_SITE_KEY && (
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              onVerify={handleCaptchaVerify}
              onExpire={handleCaptchaExpire}
              onError={handleCaptchaExpire}
            />
          )}

          {error && (
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">
                <Icon icon={AlertCircle} size="sm" color="destructive" />
              </div>
              <Text.H6 color="destructive">{error}</Text.H6>
            </div>
          )}

          <Button
            size="full"
            type="submit"
            disabled={isLoading}
            className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-[1px] active:shadow-none transition-all"
          >
            {isRedirectingToSso
              ? "Redirecting to your identity provider…"
              : isLoading
                ? "Sending…"
                : "Continue with email"}
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-[1px] bg-border" />
          <span className="bg-muted/50 px-2 text-xs leading-4 text-muted-foreground">Or</span>
          <div className="flex-1 h-[1px] bg-border" />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            onClick={handleGoogleClick}
            disabled={isLoading}
            className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
          >
            <GoogleIcon className="mr-2" />
            Continue with Google
          </Button>

          <Button
            size="lg"
            variant="ghost"
            onClick={handleGitHubClick}
            disabled={isLoading}
            className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-medium leading-5 text-foreground bg-background border border-input hover:bg-muted disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 transition-colors"
          >
            <GitHubIcon className="mr-2" />
            Continue with GitHub
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-y-4">
        <Text.H6 color="foregroundMuted" align="center">
          If you have any problem or suggestion check our{" "}
          <a
            href="https://docs.latitude.so"
            className="text-accent-foreground underline hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            documentation
          </a>{" "}
          or contact us via{" "}
          <a href="mailto:hello@latitude.so" className="text-accent-foreground underline hover:no-underline">
            email
          </a>{" "}
          or{" "}
          <a
            href="https://join.slack.com/t/trylatitude/shared_invite/zt-35wu2h9es-N419qlptPMhyOeIpj3vjzw"
            className="text-accent-foreground underline hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Slack
          </a>
          .
        </Text.H6>
      </div>
    </AuthScreen>
  )
}
