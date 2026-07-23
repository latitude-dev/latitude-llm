import { Button, CloseTrigger, Icon, Modal, Switch, Text, Tooltip, useToast } from "@repo/ui"
import { useParams } from "@tanstack/react-router"
import { BellIcon, BellOffIcon, CheckIcon, EyeIcon, EyeOffIcon, LinkIcon, UndoIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { invalidateSignalQueries, useSignalDetail } from "../../../../../../domains/signals/signals.collection.ts"
import { applySignalLifecycleAction } from "../../../../../../domains/signals/signals.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

type LifecycleConfirmationAction = "resolve" | "unresolve" | "ignore" | "unignore" | "mute" | "unmute"

const CONFIRMATION_TOASTS: Record<LifecycleConfirmationAction, string> = {
  resolve: "Signal resolved.",
  unresolve: "Signal reopened.",
  ignore: "Signal ignored.",
  unignore: "Signal returned to the active list.",
  mute: "Signal notifications muted.",
  unmute: "Signal notifications unmuted.",
}

function getLifecycleConfirmation(action: LifecycleConfirmationAction) {
  switch (action) {
    case "resolve":
      return {
        title: "Resolve signal",
        description:
          "Mark this signal as resolved. If this signal starts occurring again we will alert you and promote it as regressed",
        confirmLabel: "Resolve",
        confirmIcon: CheckIcon,
        confirmVariant: undefined,
      }
    case "unresolve":
      return {
        title: "Unresolve signal",
        description: "Reopen this signal. New occurrences won't mark this signal as regressed",
        confirmLabel: "Unresolve",
        confirmIcon: UndoIcon,
        confirmVariant: undefined,
      }
    case "ignore":
      return {
        title: "Ignore signal",
        description:
          "Mark this signal as ignored. We won't monitor or alert you about new occurrences of this signal anymore",
        confirmLabel: "Ignore",
        confirmIcon: EyeOffIcon,
        confirmVariant: "destructive" as const,
      }
    case "unignore":
      return {
        title: "Unignore signal",
        description: "Stop ignoring this signal. New occurrences will surface it again",
        confirmLabel: "Unignore",
        confirmIcon: EyeIcon,
        confirmVariant: undefined,
      }
    case "mute":
      return {
        title: "Mute signal",
        description: "Silence this signal. New occurrences still start incidents, but they won't send notifications",
        confirmLabel: "Mute",
        confirmIcon: BellOffIcon,
        confirmVariant: "destructive" as const,
      }
    case "unmute":
      return {
        title: "Unmute signal",
        description: "Unmute this signal. New occurrences will be notified again",
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
  const [keepMonitoring, setKeepMonitoring] = useState(true)
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false)

  const lifecycleConfirmation = lifecycleConfirmAction ? getLifecycleConfirmation(lifecycleConfirmAction) : null
  const hasActiveEvaluations = (issue?.evaluations.length ?? 0) > 0

  const keepMonitoringDefault = issue?.keepMonitoringDefault ?? true
  const openConfirmation = useCallback(
    (action: LifecycleConfirmationAction) => {
      if (action === "resolve") setKeepMonitoring(keepMonitoringDefault)
      setLifecycleConfirmAction(action)
    },
    [keepMonitoringDefault],
  )

  const runLifecycleCommand = async (command: LifecycleConfirmationAction) => {
    setIsLifecycleLoading(true)
    try {
      await applySignalLifecycleAction({
        data: {
          projectId,
          signalId,
          command,
          ...(command === "resolve" && hasActiveEvaluations ? { keepMonitoring } : {}),
        },
      })
      await invalidateSignalQueries(projectId, signalId)
      toast({ description: CONFIRMATION_TOASTS[command] })
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
      id: `issue:${signalId}:${issue.resolvedAt ? "unresolve" : "resolve"}`,
      title: issue.resolvedAt ? "Unresolve signal" : "Resolve signal",
      icon: issue.resolvedAt ? UndoIcon : CheckIcon,
      section: "context",
      group: "Signal",
      keywords: issue.resolvedAt ? "unresolve reopen" : "resolve archive done fixed",
      perform: () => openConfirmation(issue.resolvedAt ? "unresolve" : "resolve"),
    })

    commands.push({
      id: `issue:${signalId}:${issue.ignoredAt ? "unignore" : "ignore"}`,
      title: issue.ignoredAt ? "Unignore signal" : "Ignore signal",
      icon: issue.ignoredAt ? EyeIcon : EyeOffIcon,
      section: "context",
      group: "Signal",
      keywords: issue.ignoredAt ? "unignore restore" : "ignore archive dismiss noise",
      perform: () => openConfirmation(issue.ignoredAt ? "unignore" : "ignore"),
    })

    commands.push({
      id: `issue:${signalId}:${issue.mutedAt ? "unmute" : "mute"}`,
      title: issue.mutedAt ? "Unmute signal" : "Mute signal",
      icon: issue.mutedAt ? BellIcon : BellOffIcon,
      section: "context",
      group: "Signal",
      keywords: issue.mutedAt ? "unmute resume notifications" : "mute pause notifications",
      perform: () => openConfirmation(issue.mutedAt ? "unmute" : "mute"),
    })

    if (projectSlug) {
      commands.push({
        id: `issue:${signalId}:copy-link`,
        title: "Copy signal link",
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
  }, [issue, openConfirmation, projectSlug, signalId, toast])

  useRegisterCommands(paletteCommands)

  const isLifecycleDisabled = issue === null || issue === undefined || isLifecycleLoading
  const buttonSize = compact ? ("sm" as const) : undefined
  const buttonClassName = compact ? "text-sm" : "text-foreground group-hover:text-secondary-foreground/80"

  const primaryAction: LifecycleConfirmationAction = issue?.resolvedAt ? "unresolve" : "resolve"
  const secondaryAction: LifecycleConfirmationAction = issue?.ignoredAt ? "unignore" : "ignore"

  return (
    <>
      <Button
        size={buttonSize}
        variant={issue?.resolvedAt ? "outline" : "default"}
        className={issue?.resolvedAt ? buttonClassName : undefined}
        disabled={isLifecycleDisabled}
        onClick={() => openConfirmation(primaryAction)}
      >
        <Icon icon={issue?.resolvedAt ? UndoIcon : CheckIcon} size="sm" />
        {issue?.resolvedAt ? "Unresolve" : "Resolve"}
      </Button>

      <Button
        variant="outline"
        size={buttonSize}
        className={buttonClassName}
        disabled={isLifecycleDisabled}
        onClick={() => openConfirmation(secondaryAction)}
      >
        <Icon icon={issue?.ignoredAt ? EyeIcon : EyeOffIcon} size="sm" />
        {issue?.ignoredAt ? "Unignore" : "Ignore"}
      </Button>

      <Tooltip
        side="bottom"
        trigger={
          <Button
            variant="outline"
            size={buttonSize}
            className={buttonClassName}
            disabled={isLifecycleDisabled}
            onClick={() => openConfirmation(issue?.mutedAt ? "unmute" : "mute")}
          >
            <Icon icon={issue?.mutedAt ? BellOffIcon : BellIcon} size="sm" />
          </Button>
        }
      >
        {issue?.mutedAt ? "Unmute incident notifications" : "Mute incident notifications"}
      </Tooltip>

      {lifecycleConfirmAction !== null && lifecycleConfirmation !== null ? (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setLifecycleConfirmAction(null)
          }}
          dismissible
          title={lifecycleConfirmation.title}
          description={lifecycleConfirmation.description}
          footer={
            <>
              <CloseTrigger />
              <Button
                {...(lifecycleConfirmation.confirmVariant ? { variant: lifecycleConfirmation.confirmVariant } : {})}
                onClick={() => void runLifecycleCommand(lifecycleConfirmAction)}
                disabled={isLifecycleLoading}
              >
                <Icon icon={lifecycleConfirmation.confirmIcon} size="sm" />
                {lifecycleConfirmation.confirmLabel}
              </Button>
            </>
          }
        >
          {/* A single expression child: `Modal` only renders its padded body
              slot when children are truthy, and a two-expression list would
              reach it as an always-truthy array. */}
          {lifecycleConfirmAction === "resolve" && hasActiveEvaluations ? (
            <div className="flex items-start gap-3">
              <Switch checked={keepMonitoring} onCheckedChange={setKeepMonitoring} disabled={isLifecycleLoading} />
              <div className="flex flex-col gap-1">
                <Text.H6>Keep evaluating this signal</Text.H6>
                <Text.H6 color="foregroundMuted">
                  {keepMonitoring
                    ? "Its evaluations keep running so a regression reopens the signal."
                    : "Its evaluations will be archived; regressions won't be detected."}
                </Text.H6>
              </div>
            </div>
          ) : lifecycleConfirmAction === "ignore" && issue?.origin === "user" ? (
            <Text.H6 color="foregroundMuted">
              This signal's evaluation will be archived. Unignoring won't restore it — re-create it from Edit.
            </Text.H6>
          ) : null}
        </Modal>
      ) : null}
    </>
  )
}
