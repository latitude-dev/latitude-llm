import { Button, GitHubIcon, GoogleIcon, Icon, LatitudeLogo, Text } from "@repo/ui"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { AlertCircle, Mail } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import z from "zod"
import { Turnstile } from "../components/turnstile.tsx"
import { sendMagicLink } from "../domains/auth/auth.functions.ts"
import { getSession } from "../domains/sessions/session.functions.ts"
import { authClient } from "../lib/auth-client.ts"
import { TURNSTILE_SITE_KEY, WEB_BASE_URL } from "../lib/auth-config.ts"
import { toUserMessage } from "../lib/errors.ts"

const loginSearchParams = z.object({
  redirect: z.string().optional(),
  email: z.string().optional(),
})

const LOGIN_URL = `${WEB_BASE_URL}/login`

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchParams,
  beforeLoad: async () => {
    const session = await getSession()
    if (session) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectPath, email: prefilledEmail } = Route.useSearch()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [isSent, setIsSent] = useState(false)
  const [email, setEmail] = useState(prefilledEmail ?? "")
  const captchaTokenRef = useRef<string | undefined>(undefined)
  const handleCaptchaVerify = useCallback((token: string) => {
    captchaTokenRef.current = token
  }, [])
  const handleCaptchaExpire = useCallback(() => {
    captchaTokenRef.current = undefined
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return

    const formData = new FormData(e.currentTarget)
    const emailValue = String(formData.get("email") ?? "")
    setEmail(emailValue)

    setIsLoading(true)
    setError(undefined)

    const callbackPath = redirectPath ?? "/"
    const emailFlow = redirectPath ? "signin" : undefined
    const separator = callbackPath.includes("?") ? "&" : "?"
    const callbackURL = emailFlow ? `${callbackPath}${separator}emailFlow=${emailFlow}` : callbackPath

    try {
      await sendMagicLink({
        data: {
          email: emailValue,
          callbackURL,
          newUserCallbackURL: redirectPath ?? "/welcome",
          captchaToken: captchaTokenRef.current,
        },
      })

      setIsSent(true)
    } catch (err) {
      setError(toUserMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const submitSocialSignIn = async (provider: "google" | "github") => {
    if (isLoading) return

    setIsLoading(true)
    setError(undefined)

    const callbackURL = redirectPath ? `${WEB_BASE_URL}${redirectPath}` : `${WEB_BASE_URL}/`
    const newUserCallbackURL = redirectPath ? `${WEB_BASE_URL}${redirectPath}` : `${WEB_BASE_URL}/welcome`

    try {
      const { error: signInError } = await authClient.signIn.social({
        provider,
        callbackURL,
        newUserCallbackURL,
        errorCallbackURL: LOGIN_URL,
        fetchOptions: captchaTokenRef.current
          ? { headers: { "x-captcha-response": captchaTokenRef.current } }
          : undefined,
      })

      if (signInError) {
        throw new Error(signInError.message ?? "Failed to sign in with OAuth provider")
      }
    } catch (err) {
      setError(toUserMessage(err))
      setIsLoading(false)
    }
  }

  const handleGoogleClick = () => submitSocialSignIn("google")

  const handleGitHubClick = () => submitSocialSignIn("github")

  if (isSent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <div className="flex flex-col items-center justify-center gap-y-6 max-w-[22rem] w-full">
          <LatitudeLogo />

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
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col gap-y-6 max-w-[22rem] w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Welcome to Latitude</Text.H3>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label htmlFor="email" className="flex flex-col gap-2">
              <Text.H6 weight="medium">Email</Text.H6>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="Ex.: jon@example.com"
                required
                autoComplete="email"
                data-autofocus="true"
                defaultValue={email}
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            {TURNSTILE_SITE_KEY && (
              <Turnstile
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                onError={handleCaptchaExpire}
              />
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Icon icon={AlertCircle} className="h-4 w-4" />
                <Text.H6 color="destructive">{error}</Text.H6>
              </div>
            )}

            <Button
              size="full"
              type="submit"
              disabled={isLoading}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-[1px] active:shadow-none transition-all"
            >
              {isLoading ? "Sending…" : "Continue with email"}
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
      </div>
    </div>
  )
}
