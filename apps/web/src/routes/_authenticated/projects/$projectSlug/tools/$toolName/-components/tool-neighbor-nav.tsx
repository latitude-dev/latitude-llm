import { Button, Tooltip } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useNavigate } from "@tanstack/react-router"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useMemo } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { type ToolsTimeRange, useProjectTools } from "../../../../../../../domains/tools/tools.collection.ts"

/**
 * Previous/next-tool navigation for the full-page tool view, cycling the
 * default list order (calls desc). `J` = next, `K` = previous, suppressed
 * while a trace sheet is open so paging a trace never swaps the tool.
 */
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

  const goToTool = (target: string | undefined) => {
    if (!target) return
    void navigate({ to: "/projects/$projectSlug/tools/$toolName", params: { projectSlug, toolName: target } })
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
      <Tooltip
        asChild
        side="bottom"
        trigger={
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={!prevName}
            onClick={() => goToTool(prevName)}
            type="button"
            aria-label="Previous tool"
          >
            <ArrowUpIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      >
        Previous tool <HotkeyBadge hotkey="K" />
      </Tooltip>
      <Tooltip
        asChild
        side="bottom"
        trigger={
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={!nextName}
            onClick={() => goToTool(nextName)}
            type="button"
            aria-label="Next tool"
          >
            <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      >
        Next tool <HotkeyBadge hotkey="J" />
      </Tooltip>
    </>
  )
}
