import {
  Button,
  CloseTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Icon,
  Label,
  Modal,
  Switch,
  Text,
  useToast,
} from "@repo/ui"
import { useParams } from "@tanstack/react-router"
import { CheckIcon, LinkIcon, MoreVerticalIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { invalidateSignalQueries, useSignalDetail } from "../../../../../../domains/issues/issues.collection.ts"
import { applySignalLifecycleAction } from "../../../../../../domains/issues/issues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

type LifecycleConfirmationAction = "ignore" | "unignore" | "unresolve"

function getLifecycleConfirmation(action: LifecycleConfirmationAction) {
  switch (action) {
    case "ignore":
      return {
        title: "Ignore issue",
        description: "Mark this issue as ignored. You won't be alerted about new occurrences of this issue anymore",
        confirmLabel: "Ignore",
        confirmIcon: PauseIcon,
        confirmVariant: "destructive" as const,
      }
    case "unignore":
      return {
        title: "Unignore issue",
        description: "Stop ignoring this issue. New occurrences will surface it again",
        confirmLabel: "Unignore",
        confirmIcon: PlayIcon,
        confirmVariant: undefined,
      }
    case "unresolve":
      return {
        title: "Unresolve issue",
        description: "Reopen this issue. New occurrences won't mark this issue as regressed",
        confirmLabel: "Unresolve",
        confirmIcon: XIcon,
        confirmVariant: "destructive" as const,
      }
  }
}

/**
 * Ignore + Resolve buttons (and their confirmation modals) for an issue.
 *
 * Lifted out of the body so both the standalone issue drawer and the
 * session-panel issue slot can render these in the top toolbar (alongside
 * next/prev or "View session"), instead of cramming them next to the title.
 *
 * `compact` collapses the pair into a primary Resolve button + an overflow
 * (kebab) menu holding Ignore — for the issue page header, where the inline
 * triage pickers already make the action area wide.
 */
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
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [lifecycleConfirmAction, setLifecycleConfirmAction] = useState<LifecycleConfirmationAction | null>(null)
  const [keepMonitoring, setKeepMonitoring] = useState(true)
  const [isLifecycleLoading, setIsLifecycleLoading] = useState(false)

  const hasActiveLinkedEvaluations =
    issue?.evaluations.some((evaluation) => evaluation.archivedAt === null && evaluation.deletedAt === null) ?? false
  const lifecycleConfirmation = lifecycleConfirmAction ? getLifecycleConfirmation(lifecycleConfirmAction) : null

  const runLifecycleCommand = async (command: "resolve" | "unresolve" | "ignore" | "unignore", override?: boolean) => {
    setIsLifecycleLoading(true)
    try {
      await applySignalLifecycleAction({
        data: {
          projectId,
          signalId,
          command,
          ...(override !== undefined ? { keepMonitoring: override } : {}),
        },
      })
      await invalidateSignalQueries(projectId, signalId)
      toast({
        description:
          command === "resolve"
            ? "Signal resolved."
            : command === "unresolve"
              ? "Signal reopened."
              : command === "ignore"
                ? "Signal ignored."
                : "Signal unignored.",
      })
      setResolveModalOpen(false)
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

  // Contribute the lifecycle + copy actions to the global command palette while this issue
  // is open, reusing the same modal flows the toolbar buttons trigger.
  const paletteCommands = useMemo<readonly PaletteCommand[]>(() => {
    if (!issue) return []
    const commands: PaletteCommand[] = []

    if (issue.resolvedAt) {
      commands.push({
        id: `issue:${signalId}:unresolve`,
        title: "Unresolve issue",
        icon: XIcon,
        section: "context",
        group: "Signal",
        keywords: "unresolve reopen regressed",
        perform: () => setLifecycleConfirmAction("unresolve"),
      })
    } else {
      commands.push({
        id: `issue:${signalId}:resolve`,
        title: "Resolve issue",
        icon: CheckIcon,
        section: "context",
        group: "Signal",
        keywords: "resolve close fix done",
        perform: () => {
          setKeepMonitoring(issue.keepMonitoringDefault ?? true)
          setResolveModalOpen(true)
        },
      })
    }

    commands.push(
      issue.ignoredAt
        ? {
            id: `issue:${signalId}:unignore`,
            title: "Unignore issue",
            icon: PlayIcon,
            section: "context",
            group: "Signal",
            keywords: "unignore unmute resume",
            perform: () => setLifecycleConfirmAction("unignore"),
          }
        : {
            id: `issue:${signalId}:ignore`,
            title: "Ignore issue",
            icon: PauseIcon,
            section: "context",
            group: "Signal",
            keywords: "ignore mute dismiss",
            perform: () => setLifecycleConfirmAction("ignore"),
          },
    )

    if (projectSlug) {
      commands.push({
        id: `issue:${signalId}:copy-link`,
        title: "Copy issue link",
        icon: LinkIcon,
        section: "context",
        group: "Signal",
        keywords: "copy link url share",
        perform: () => {
          void navigator.clipboard.writeText(`${window.location.origin}/projects/${projectSlug}/issues/${signalId}`)
          toast({ description: "Signal link copied to clipboard." })
        },
      })
    }

    return commands
  }, [issue, projectSlug, signalId, toast])

  useRegisterCommands(paletteCommands)

  const isLifecycleDisabled = issue === null || issue === undefined || isLifecycleLoading

  const onResolveClick = () => {
    if (issue?.resolvedAt) {
      setLifecycleConfirmAction("unresolve")
      return
    }

    setKeepMonitoring(issue?.keepMonitoringDefault ?? true)
    setResolveModalOpen(true)
  }

  // Compact (issue page header): the primary action is a filled `h-7` pill that
  // lines up with the adjacent triage pickers; secondary lives in the kebab.
  // Default (drawer/session toolbar): the original outline button, unchanged.
  const resolveButton = compact ? (
    <Button variant="default" size="sm" className="text-sm" disabled={isLifecycleDisabled} onClick={onResolveClick}>
      <Icon icon={issue?.resolvedAt ? XIcon : CheckIcon} size="sm" />
      {issue?.resolvedAt ? "Unresolve" : "Resolve"}
    </Button>
  ) : (
    <Button variant="outline" disabled={isLifecycleDisabled} onClick={onResolveClick}>
      <Icon icon={issue?.resolvedAt ? XIcon : CheckIcon} size="sm" />
      {issue?.resolvedAt ? "Unresolve" : "Resolve"}
    </Button>
  )

  return (
    <>
      {compact ? (
        <>
          {resolveButton}
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={isLifecycleDisabled}
                aria-label="More issue actions"
              >
                <Icon icon={MoreVerticalIcon} size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => setLifecycleConfirmAction(issue?.ignoredAt ? "unignore" : "ignore")}
              >
                <Icon icon={issue?.ignoredAt ? PlayIcon : PauseIcon} size="sm" />
                {issue?.ignoredAt ? "Unignore" : "Ignore"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            className="text-foreground group-hover:text-secondary-foreground/80"
            disabled={isLifecycleDisabled}
            onClick={() => setLifecycleConfirmAction(issue?.ignoredAt ? "unignore" : "ignore")}
          >
            <Icon icon={issue?.ignoredAt ? PlayIcon : PauseIcon} size="sm" />
            {issue?.ignoredAt ? "Unignore" : "Ignore"}
          </Button>
          {resolveButton}
        </>
      )}

      <Modal.Root open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <Modal.Content dismissible>
          <Modal.Header
            title="Resolve issue"
            description="Mark this issue as resolved. If this issue starts occurring again we will alert you and promote it as regressed"
          />
          {hasActiveLinkedEvaluations ? (
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="keep-monitoring-on-resolve">Keep evaluating this issue</Label>
                    <Text.H6 color="foregroundMuted">
                      Evaluations for this issue will stay active to detect further regressions
                    </Text.H6>
                  </div>
                  <Switch
                    id="keep-monitoring-on-resolve"
                    checked={keepMonitoring}
                    onCheckedChange={setKeepMonitoring}
                    disabled={isLifecycleLoading}
                    aria-label="Keep evaluating this issue"
                  />
                </div>
              </div>
            </Modal.Body>
          ) : null}
          <Modal.Footer>
            <Button variant="outline" onClick={() => setResolveModalOpen(false)} disabled={isLifecycleLoading}>
              Cancel
            </Button>
            <Button onClick={() => void runLifecycleCommand("resolve", keepMonitoring)} disabled={isLifecycleLoading}>
              <Icon icon={CheckIcon} size="sm" />
              Resolve
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

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
              <Icon icon={lifecycleConfirmation?.confirmIcon ?? XIcon} size="sm" />
              {lifecycleConfirmation?.confirmLabel ?? "Confirm"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
