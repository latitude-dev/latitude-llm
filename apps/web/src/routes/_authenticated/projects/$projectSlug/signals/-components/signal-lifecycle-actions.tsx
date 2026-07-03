import { Button, CloseTrigger, Icon, Modal, useToast } from "@repo/ui"
import { useParams } from "@tanstack/react-router"
import { BellIcon, BellOffIcon, LinkIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { invalidateSignalQueries, useSignalDetail } from "../../../../../../domains/signals/signals.collection.ts"
import { applySignalLifecycleAction } from "../../../../../../domains/signals/signals.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

type LifecycleConfirmationAction = "mute" | "unmute"

function getLifecycleConfirmation(action: LifecycleConfirmationAction) {
  switch (action) {
    case "mute":
      return {
        title: "Mute signal",
        description: "Mute this signal. New occurrences still start incidents, but they won't send notifications.",
        confirmLabel: "Mute",
        confirmIcon: BellOffIcon,
        confirmVariant: "destructive" as const,
      }
    case "unmute":
      return {
        title: "Unmute signal",
        description: "Unmute this signal so new occurrences can trigger notifications again.",
        confirmLabel: "Unmute",
        confirmIcon: BellIcon,
        confirmVariant: undefined,
      }
  }
}

export function SignalLifecycleActions({
  projectId,
  signalId,
  compact = false,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly compact?: boolean
}) {
  const { toast } = useToast()
  const { projectSlug } = useParams({ strict: false })
  const { data: issue } = useSignalDetail({ projectId, signalId })
  const [lifecycleConfirmAction, setLifecycleConfirmAction] = useState<LifecycleConfirmationAction | null>(null)
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false)

  const lifecycleConfirmation = lifecycleConfirmAction ? getLifecycleConfirmation(lifecycleConfirmAction) : null

  const runLifecycleCommand = async (command: LifecycleConfirmationAction) => {
    setIsLifecycleLoading(true)
    try {
      await applySignalLifecycleAction({
        data: {
          projectId,
          signalId,
          command,
        },
      })
      await invalidateSignalQueries(projectId, signalId)
      toast({
        description: command === "mute" ? "Signal muted." : "Signal unmuted.",
      })
      setLifecycleConfirmAction(null)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setIsLifecycleLoading(false)
    }
  }

  const paletteCommands = useMemo<readonly PaletteCommand[]>(() => {
    if (!issue) return []
    const commands: PaletteCommand[] = []

    commands.push({
      id: `issue:${signalId}:${issue.mutedAt ? "unmute" : "mute"}`,
      title: issue.mutedAt ? "Unmute signal" : "Mute signal",
      icon: issue.mutedAt ? BellIcon : BellOffIcon,
      section: "context",
      group: "Signal",
      keywords: issue.mutedAt ? "unmute resume" : "mute pause",
      perform: () => setLifecycleConfirmAction(issue.mutedAt ? "unmute" : "mute"),
    })

    if (projectSlug) {
      commands.push({
        id: `issue:${signalId}:copy-link`,
        title: "Copy issue link",
        icon: LinkIcon,
        section: "context",
        group: "Signal",
        keywords: "copy link url share",
        perform: () => {
          void navigator.clipboard.writeText(`${window.location.origin}/projects/${projectSlug}/signals/${signalId}`)
          toast({ description: "Signal link copied to clipboard." })
        },
      })
    }

    return commands
  }, [issue, projectSlug, signalId, toast])

  useRegisterCommands(paletteCommands)

  const isLifecycleDisabled = issue === null || issue === undefined || isLifecycleLoading
  const action = issue?.mutedAt ? "unmute" : "mute"

  return (
    <>
      <Button
        variant="outline"
        size={compact ? "sm" : undefined}
        className={compact ? "text-sm" : "text-foreground group-hover:text-secondary-foreground/80"}
        disabled={isLifecycleDisabled}
        onClick={() => setLifecycleConfirmAction(action)}
      >
        <Icon icon={issue?.mutedAt ? BellIcon : BellOffIcon} size="sm" />
        {issue?.mutedAt ? "Unmute" : "Mute"}
      </Button>

      <Modal.Root
        open={lifecycleConfirmAction !== null}
        onOpenChange={(open) => (!open ? setLifecycleConfirmAction(null) : undefined)}
      >
        <Modal.Content dismissible>
          <Modal.Header
            title={lifecycleConfirmation?.title ?? "Confirm issue action"}
            description={lifecycleConfirmation?.description ?? "Are you sure you want to continue?"}
          />
          <Modal.Footer>
            <CloseTrigger />
            <Button
              {...(lifecycleConfirmation?.confirmVariant ? { variant: lifecycleConfirmation.confirmVariant } : {})}
              onClick={() => (lifecycleConfirmAction ? void runLifecycleCommand(lifecycleConfirmAction) : undefined)}
              disabled={lifecycleConfirmAction === null || isLifecycleLoading}
            >
              <Icon icon={lifecycleConfirmation?.confirmIcon ?? BellOffIcon} size="sm" />
              {lifecycleConfirmation?.confirmLabel ?? "Confirm"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
