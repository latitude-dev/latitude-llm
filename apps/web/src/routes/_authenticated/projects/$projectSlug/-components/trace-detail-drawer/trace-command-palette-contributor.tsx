import { useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, GaugeIcon, LayersIcon, ListTreeIcon, MessagesSquareIcon } from "lucide-react"
import { useMemo } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import { useCurrentProject } from "../../../../../../components/command-palette/commands/use-current-project.ts"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import type { TraceDetailTabId } from "../trace-detail-drawer.tsx"

/**
 * Headless: builds the open trace's contextual palette commands (tab navigation
 * + copy ids + open session) and registers them while mounted.
 *
 * Split out of `TraceDetailBody` so the parent can render it conditionally —
 * `useRegisterCommands` requires a `CommandPaletteProvider`, which the sandbox
 * shell doesn't mount, so the parent gates this out under a sandbox scope. All
 * palette-only concerns (`useToast` / `useNavigate` / `useCurrentProject`) live
 * here rather than leaking into the body.
 */
export function TraceCommandPaletteContributor({
  traceId,
  traceRecord,
  onGoToTab,
}: {
  readonly traceId: string
  readonly traceRecord: TraceRecord | undefined
  readonly onGoToTab: (tab: TraceDetailTabId) => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const project = useCurrentProject()

  // Ids include the traceId so two mounted bodies never collide.
  const commands = useMemo<readonly PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [
      {
        id: `trace:${traceId}:conversation`,
        title: "View conversation",
        icon: MessagesSquareIcon,
        section: "context",
        group: "Trace",
        keywords: "conversation messages",
        perform: () => onGoToTab("conversation"),
      },
      {
        id: `trace:${traceId}:spans`,
        title: "View spans",
        icon: ListTreeIcon,
        section: "context",
        group: "Trace",
        keywords: "spans tree",
        perform: () => onGoToTab("spans"),
      },
      {
        id: `trace:${traceId}:scores`,
        title: "View scores",
        icon: GaugeIcon,
        section: "context",
        group: "Trace",
        keywords: "scores annotations evaluations custom",
        perform: () => onGoToTab("scores"),
      },
    ]

    if (project && traceRecord?.sessionId) {
      const { sessionId } = traceRecord
      const projectSlug = project.slug
      commands.push({
        id: `trace:${traceId}:open-session`,
        title: "Open session",
        icon: LayersIcon,
        section: "context",
        group: "Trace",
        keywords: "open session view conversation",
        perform: () => navigate({ to: `/projects/${projectSlug}`, search: { sessionId, tab: "sessions" } }),
      })
    }

    commands.push({
      id: `trace:${traceId}:copy-id`,
      title: "Copy trace ID",
      icon: CopyIcon,
      section: "context",
      group: "Trace",
      keywords: "copy trace id",
      perform: () => {
        void navigator.clipboard.writeText(traceId)
        toast({ description: "Trace ID copied to clipboard." })
      },
    })

    if (traceRecord?.sessionId) {
      const { sessionId } = traceRecord
      commands.push({
        id: `trace:${traceId}:copy-session-id`,
        title: "Copy session ID",
        icon: CopyIcon,
        section: "context",
        group: "Trace",
        keywords: "copy session id",
        perform: () => {
          void navigator.clipboard.writeText(sessionId)
          toast({ description: "Session ID copied to clipboard." })
        },
      })
    }

    if (traceRecord?.userId) {
      const { userId } = traceRecord
      commands.push({
        id: `trace:${traceId}:copy-user-id`,
        title: "Copy user ID",
        icon: CopyIcon,
        section: "context",
        group: "Trace",
        keywords: "copy user id",
        perform: () => {
          void navigator.clipboard.writeText(userId)
          toast({ description: "User ID copied to clipboard." })
        },
      })
    }

    if (traceRecord?.rootSpanId) {
      const { rootSpanId } = traceRecord
      commands.push({
        id: `trace:${traceId}:copy-root-span-id`,
        title: "Copy root span ID",
        icon: CopyIcon,
        section: "context",
        group: "Trace",
        keywords: "copy root span id",
        perform: () => {
          void navigator.clipboard.writeText(rootSpanId)
          toast({ description: "Root span ID copied to clipboard." })
        },
      })
    }

    return commands
  }, [traceId, traceRecord, project, navigate, onGoToTab, toast])

  useRegisterCommands(commands)
  return null
}
