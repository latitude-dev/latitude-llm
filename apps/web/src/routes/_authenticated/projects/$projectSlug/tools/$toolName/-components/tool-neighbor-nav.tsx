import { Button, Tooltip } from "@repo/ui"
import { type RegisterableHotkey, useHotkeys } from "@tanstack/react-hotkeys"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { type ToolsTimeRange, useProjectTools } from "../../../../../../../domains/tools/tools.collection.ts"

/**
 * Real link when a neighbor exists (href, cmd/middle-click), disabled button
 * otherwise. The search params carry over so the error view and the selected
 * time range survive paging between tools. The Tooltip wraps the Button
 * directly — a wrapper component in between would swallow the trigger props
 * Tooltip injects via asChild.
 */
function NeighborButton({
  projectSlug,
  target,
  label,
  hotkey,
  children,
}: {
  readonly projectSlug: string
  readonly target: string | undefined
  readonly label: string
  readonly hotkey: RegisterableHotkey
  readonly children: ReactNode
}) {
  return (
    <Tooltip
      asChild
      side="bottom"
      trigger={
        target ? (
          <Button asChild variant="ghost" className="h-8 w-8 p-0" aria-label={label}>
            <Link
              to="/projects/$projectSlug/tools/$toolName"
              params={{ projectSlug, toolName: target }}
              search={(prev) => prev}
            >
              {children}
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" className="h-8 w-8 p-0" disabled type="button" aria-label={label}>
            {children}
          </Button>
        )
      }
    >
      {label} <HotkeyBadge hotkey={hotkey} />
    </Tooltip>
  )
}

// J/K hotkeys are suppressed while a trace sheet is open so paging a trace
// never swaps the tool.
export function ToolNeighborNav({
  projectId,
  projectSlug,
  toolName,
  range,
  trendBucketSeconds,
  overlayActive,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly trendBucketSeconds: number
  readonly overlayActive: boolean
}) {
  const navigate = useNavigate()
  // Shares the list page's query key, so this is a cache hit when arriving
  // from the list.
  const { data: analytics } = useProjectTools({ projectId, range, trendBucketSeconds })

  const { prevName, nextName } = useMemo(() => {
    const names = (analytics?.tools ?? [])
      .slice()
      .sort((a, b) => (b.metrics?.calls ?? 0) - (a.metrics?.calls ?? 0) || a.name.localeCompare(b.name))
      .map((tool) => tool.name)
    const index = names.indexOf(toolName)
    if (index < 0) return { prevName: undefined, nextName: undefined }
    return {
      prevName: index > 0 ? names[index - 1] : undefined,
      nextName: index < names.length - 1 ? names[index + 1] : undefined,
    }
  }, [analytics, toolName])

  // Hotkeys are programmatic navigation — the buttons themselves are Links.
  const goToTool = (target: string | undefined) => {
    if (!target) return
    void navigate({
      to: "/projects/$projectSlug/tools/$toolName",
      params: { projectSlug, toolName: target },
      search: (prev: Record<string, unknown>) => prev,
    })
  }

  useHotkeys([
    {
      hotkey: "J",
      callback: () => goToTool(nextName),
      options: { enabled: !!nextName && !overlayActive, ignoreInputs: true },
    },
    {
      hotkey: "K",
      callback: () => goToTool(prevName),
      options: { enabled: !!prevName && !overlayActive, ignoreInputs: true },
    },
  ])

  return (
    <>
      <NeighborButton projectSlug={projectSlug} target={prevName} label="Previous tool" hotkey="K">
        <ArrowUpIcon className="h-4 w-4 text-muted-foreground" />
      </NeighborButton>
      <NeighborButton projectSlug={projectSlug} target={nextName} label="Next tool" hotkey="J">
        <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
      </NeighborButton>
    </>
  )
}
