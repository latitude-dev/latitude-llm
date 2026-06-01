import { Button, CloseTrigger, Icon, Label, Modal, Switch, Text, useToast } from "@repo/ui"
import { useParams } from "@tanstack/react-router"
import { CheckIcon, LinkIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { invalidateIssueQueries, useIssueDetail } from "../../../../../../domains/issues/issues.collection.ts"
import { applyIssueLifecycleAction } from "../../../../../../domains/issues/issues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

type LifecycleConfirmationAction = "ignore" | "unignore" | "unresolve"

function getLifecycleConfirmation(action: LifecycleConfirmationAction) {
  switch (action) {
    case "ignore":
      return {
        title: "Ignore issue",
        description:
          "Mark this issue as ignored. We won't monitor or alert you about new occurrences of this issue anymore",
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
 */
export function IssueLifecycleActions({
  projectId,
  issueId,
}: {
  readonly projectId: string
  readonly issueId: string
}) {
  const { toast } = useToast()
  const { projectSlug } = useParams({ strict: false })
  const { data: issue } = useIssueDetail({ projectId, issueId })
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
      await applyIssueLifecycleAction({
        data: {
          projectId,
          issueId,
          command,
          ...(override !== undefined ? { keepMonitoring: override } : {}),
        },
      })
      await invalidateIssueQueries(projectId, issueId)
      toast({
        description:
          command === "resolve"
            ? "Issue resolved."
            : command === "unresolve"
              ? "Issue reopened."
              : command === "ignore"
                ? "Issue ignored."
                : "Issue unignored.",
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
        id: `issue:${issueId}:unresolve`,
        title: "Unresolve issue",
        icon: XIcon,
        section: "context",
        group: "Issue",
        keywords: "unresolve reopen regressed",
        perform: () => setLifecycleConfirmAction("unresolve"),
      })
    } else {
      commands.push({
        id: `issue:${issueId}:resolve`,
        title: "Resolve issue",
        icon: CheckIcon,
        section: "context",
        group: "Issue",
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
            id: `issue:${issueId}:unignore`,
            title: "Unignore issue",
            icon: PlayIcon,
            section: "context",
            group: "Issue",
            keywords: "unignore unmute resume",
            perform: () => setLifecycleConfirmAction("unignore"),
          }
        : {
            id: `issue:${issueId}:ignore`,
            title: "Ignore issue",
            icon: PauseIcon,
            section: "context",
            group: "Issue",
            keywords: "ignore mute dismiss",
            perform: () => setLifecycleConfirmAction("ignore"),
          },
    )

    if (projectSlug) {
      commands.push({
        id: `issue:${issueId}:copy-link`,
        title: "Copy issue link",
        icon: LinkIcon,
        section: "context",
        group: "Issue",
        keywords: "copy link url share",
        perform: () => {
          void navigator.clipboard.writeText(
            `${window.location.origin}/projects/${projectSlug}/issues?issueId=${issueId}`,
          )
          toast({ description: "Issue link copied to clipboard." })
        },
      })
    }

    return commands
  }, [issue, projectSlug, issueId, toast])

  useRegisterCommands(paletteCommands)

  return (
    <>
      <Button
        variant="ghost"
        className="text-foreground group-hover:text-secondary-foreground/80"
        disabled={issue === null || issue === undefined || isLifecycleLoading}
        onClick={() => setLifecycleConfirmAction(issue?.ignoredAt ? "unignore" : "ignore")}
      >
        <Icon icon={issue?.ignoredAt ? PlayIcon : PauseIcon} size="sm" />
        {issue?.ignoredAt ? "Unignore" : "Ignore"}
      </Button>
      <Button
        variant="outline"
        disabled={issue === null || issue === undefined || isLifecycleLoading}
        onClick={() => {
          if (issue?.resolvedAt) {
            setLifecycleConfirmAction("unresolve")
            return
          }

          setKeepMonitoring(issue?.keepMonitoringDefault ?? true)
          setResolveModalOpen(true)
        }}
      >
        <Icon icon={issue?.resolvedAt ? XIcon : CheckIcon} size="sm" />
        {issue?.resolvedAt ? "Unresolve" : "Resolve"}
      </Button>

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
                    <Label htmlFor="keep-monitoring-on-resolve">Keep monitoring this issue</Label>
                    <Text.H6 color="foregroundMuted">
                      Evaluations monitoring this issue will stay active to detect further regressions
                    </Text.H6>
                  </div>
                  <Switch
                    id="keep-monitoring-on-resolve"
                    checked={keepMonitoring}
                    onCheckedChange={setKeepMonitoring}
                    disabled={isLifecycleLoading}
                    aria-label="Keep monitoring this issue"
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
