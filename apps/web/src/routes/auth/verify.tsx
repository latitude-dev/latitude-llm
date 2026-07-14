import { Button, Icon, Text, useMountEffect } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { AlertCircle, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { AuthScreen } from "../../components/auth-screen.tsx"
import { hasMagicLinkVerificationToken, reconstructMagicLinkVerificationUrl } from "../../lib/auth/magic-link.ts"

export const Route = createFileRoute("/auth/verify")({
  component: VerifyMagicLinkPage,
})

function VerifyMagicLinkPage() {
  const [hasVerificationToken, setHasVerificationToken] = useState<boolean | undefined>(undefined)

  useMountEffect(() => {
    setHasVerificationToken(hasMagicLinkVerificationToken(window.location.hash))
  })

  const confirm = () => {
    const verificationUrl = reconstructMagicLinkVerificationUrl({
      fragment: window.location.hash,
      origin: window.location.origin,
    })

    if (verificationUrl) {
      window.location.assign(verificationUrl)
    } else {
      setHasVerificationToken(false)
    }
  }

  return (
    <AuthScreen title="Confirm your sign in" description="Review your request before continuing to Latitude.">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/50 p-6">
        {hasVerificationToken === false ? (
          <>
            <div role="alert" className="flex flex-col items-center gap-3 text-center">
              <Icon icon={AlertCircle} size="lg" className="text-destructive" />
              <Text.H5 color="foregroundMuted">
                This confirmation link is missing or invalid. Request a new link and try again.
              </Text.H5>
            </div>
            <Button asChild size="full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <Icon icon={ShieldCheck} size="lg" className="text-primary" />
              <Text.H5 color="foregroundMuted">
                Select continue to verify this sign-in link and securely finish signing in.
              </Text.H5>
            </div>
            <Button size="full" disabled={hasVerificationToken === undefined} onClick={confirm}>
              Continue to Latitude
            </Button>
          </>
        )}
      </div>
    </AuthScreen>
  )
}
