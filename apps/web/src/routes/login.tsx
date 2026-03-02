import { Button, GitHubIcon, GoogleIcon, Icon, LatitudeLogo, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { AlertCircle, Mail } from "lucide-react"
import { useState } from "react"

/**
 * Login page - matches https://app.latitude.so/login exactly
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"
const WEB_BASE_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [isSent, setIsSent] = useState(false)
  const [email, setEmail] = useState("")

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return

    const emailValue = (e.currentTarget.elements.namedItem("email") as HTMLInputElement).value
    setEmail(emailValue)
    setIsLoading(true)
    setError(undefined)

    try {
      const response = await fetch(`${API_BASE_URL}/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailValue,
          callbackURL: WEB_BASE_URL,
          newUserCallbackURL: WEB_BASE_URL,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message ?? "Failed to send magic link")
      }

      setIsSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleClick = () => {
    window.location.href = `${API_BASE_URL}/auth/sign-in/social?provider=google`
  }

  const handleGitHubClick = () => {
    window.location.href = `${API_BASE_URL}/auth/sign-in/social?provider=github`
  }

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
              We sent a magic link to <strong>{email}</strong>
            </Text.H5>
            <Text.H6 color="foregroundMuted" align="center">
              Click the link in the email to sign in. The link will expire in 1 hour.
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
        {/* Header with logo */}
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Welcome to Latitude</Text.H3>
          </div>
        </div>

        {/* Card container */}
        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Text.H6 weight="medium">Email</Text.H6>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="Ex.: jon@example.com"
                required
                autoComplete="email"
                data-autofocus="true"
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

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
              {isLoading ? "Sending..." : "Login"}
            </Button>
          </form>

          {/* Or divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[1px] bg-border" />
            <span className="bg-muted/50 px-2 text-xs leading-4 text-muted-foreground">Or</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          {/* OAuth buttons */}
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

        {/* Footer */}
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

          <Text.H6 color="foregroundMuted" align="center">
            Do not have an account yet?{" "}
            <Link
              to="/signup"
              className="text-accent-foreground underline hover:no-underline inline-flex items-center gap-1"
            >
              Sign up
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <title>Arrow right</title>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </Text.H6>
        </div>
      </div>
    </div>
  )
}
