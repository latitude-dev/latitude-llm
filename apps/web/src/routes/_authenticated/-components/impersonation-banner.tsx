import { Button, Icon, Text, useToast } from "@repo/ui"
import { ArrowLeftIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"
import { stopImpersonating } from "../../../domains/admin/impersonation.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"

interface ImpersonationBannerProps {
  readonly impersonatedUserEmail: string
}

/**
 * Full-width destructive bar rendered above the app nav whenever the
 * current session is an impersonation (i.e. `session.impersonatedBy` is
 * set). Prevents staff from forgetting they are acting as another user.
 *
 * "Stop impersonating" calls our {@link stopImpersonating} server
 * function — which writes the `AdminImpersonationStopped` audit event
 * and then delegates to Better Auth's `auth.api.stopImpersonating` to
 * swap the session cookie back to the admin. A hard reload follows to
 * bypass Better Auth's 5-minute session cookie cache and the route
 * tree's loader cache.
 */
export function ImpersonationBanner({ impersonatedUserEmail }: ImpersonationBannerProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleStop = async () => {
    setIsSubmitting(true)
    try {
      await stopImpersonating()
      window.location.href = "/"
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not stop impersonating",
        description: toUserMessage(error),
      })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-3 shrink-0">
      <Icon icon={ShieldAlertIcon} size="sm" color="white" />
      <Text.H5 color="white">
        You are impersonating <span className="font-semibold">{impersonatedUserEmail}</span>.
      </Text.H5>
      <div className="flex-1" />
      <Button variant="link" size="sm" disabled={isSubmitting} onClick={() => void handleStop()}>
        <Icon
          icon={isSubmitting ? Loader2Icon : ArrowLeftIcon}
          size="sm"
          color="white"
          className={isSubmitting ? "animate-spin" : ""}
        />
        <Text.H5 color="white">Stop impersonating</Text.H5>
      </Button>
    </div>
  )
}
