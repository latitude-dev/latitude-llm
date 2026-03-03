import { Button, GitHubIcon, GoogleIcon, Icon, LatitudeLogo, Text } from "@repo/ui"
import { Link, createFileRoute, redirect } from "@tanstack/react-router"
import { AlertCircle } from "lucide-react"
import { useState } from "react"
import { signIn } from "../domains/auth/auth.functions.ts"
import { getSession } from "../domains/sessions/session.functions.ts"

const AUTH_BASE_PATH = "/api/auth"

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getSession()

    if (session) {
      throw redirect({ to: "/" })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return

    const formData = new FormData(e.currentTarget)
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")

    setIsLoading(true)
    setError(undefined)

    try {
      await signIn({
        data: {
          email,
          password,
        },
      })

      window.location.href = "/"
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const submitSocialSignIn = (provider: "google" | "github") => {
    const form = document.createElement("form")
    form.method = "POST"
    form.action = `${AUTH_BASE_PATH}/sign-in/social`

    const providerInput = document.createElement("input")
    providerInput.type = "hidden"
    providerInput.name = "provider"
    providerInput.value = provider

    const callbackUrlInput = document.createElement("input")
    callbackUrlInput.type = "hidden"
    callbackUrlInput.name = "callbackURL"
    callbackUrlInput.value = window.location.origin

    form.append(providerInput, callbackUrlInput)
    document.body.appendChild(form)
    form.submit()
  }

  const handleGoogleClick = () => {
    submitSocialSignIn("google")
  }

  const handleGitHubClick = () => {
    submitSocialSignIn("github")
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
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            <label htmlFor="password" className="flex flex-col gap-2">
              <Text.H6 weight="medium">Password</Text.H6>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

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
              {isLoading ? "Signing in..." : "Login"}
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
