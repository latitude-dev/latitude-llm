import { Button, Tooltip } from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { useNavigate } from "@tanstack/react-router"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useMemo } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { useSignals } from "../../../../../../../domains/signals/signals.collection.ts"

/**
 * Previous/next-issue navigation for the full-page issue view, the page's
 * stand-in for the drawer's in-list cycling. It reconstructs the issue order by
 * re-running `useSignals` with the **default sort** for the issue's own
 * lifecycle group (active vs. archived) — it deliberately does NOT carry the
 * originating list's filters/sort/search, so cycling runs over the default
 * queue rather than the exact list the user came from. When the current issue
 * isn't in that loaded window (e.g. filtered out, or deep past the first page)
 * both arrows disable. `J` = next, `K` = previous, matching the drawer; the
 * Examples carousel owns `H`/`L`. Hotkeys are suppressed while a trace sheet is
 * open (`overlayActive`) so paging a trace never swaps the issue underneath it.
 */
export function SignalNeighborNav({
  projectId,
  projectSlug,
  signalId,
  lifecycleGroup,
  overlayActive,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly signalId: string
  readonly lifecycleGroup: "active" | "archived"
  readonly overlayActive: boolean
}) {
  const navigate = useNavigate()
  const { data: issues } = useSignals({ projectId, lifecycleGroup, enabled: projectId.length > 0 })

  const { prevId, nextId } = useMemo(() => {
    const ids = issues.map((issue) => issue.id)
    const index = ids.indexOf(signalId)
    if (index < 0) return { prevId: undefined, nextId: undefined }
    return {
      prevId: index > 0 ? ids[index - 1] : undefined,
      nextId: index < ids.length - 1 ? ids[index + 1] : undefined,
    }
  }, [issues, signalId])

  const goToSignal = (targetId: string | undefined) => {
    if (!targetId) return
    void navigate({ to: "/projects/$projectSlug/signals/$signalId", params: { projectSlug, signalId: targetId } })
  }

  useHotkeys([
    {
      hotkey: "J",
      callback: () => goToSignal(nextId),
      options: { enabled: !!nextId && !overlayActive, ignoreInputs: true },
    },
    {
      hotkey: "K",
      callback: () => goToSignal(prevId),
      options: { enabled: !!prevId && !overlayActive, ignoreInputs: true },
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
            disabled={!prevId}
            onClick={() => goToSignal(prevId)}
            type="button"
            aria-label="Previous issue"
          >
            <ArrowUpIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      >
        Previous issue <HotkeyBadge hotkey="K" />
      </Tooltip>
      <Tooltip
        asChild
        side="bottom"
        trigger={
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={!nextId}
            onClick={() => goToSignal(nextId)}
            type="button"
            aria-label="Next issue"
          >
            <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      >
        Next issue <HotkeyBadge hotkey="J" />
      </Tooltip>
    </>
  )
}
