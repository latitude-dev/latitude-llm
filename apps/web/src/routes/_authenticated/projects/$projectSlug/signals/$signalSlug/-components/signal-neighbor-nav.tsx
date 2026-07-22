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
  signalSlug,
  lifecycleGroup,
  overlayActive,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly signalSlug: string
  readonly lifecycleGroup: "active" | "archived"
  readonly overlayActive: boolean
}) {
  const navigate = useNavigate()
  const { data: issues } = useSignals({ projectId, lifecycleGroup, enabled: projectId.length > 0 })

  const { prevSlug, nextSlug } = useMemo(() => {
    const slugs = issues.map((issue) => issue.slug)
    const index = slugs.indexOf(signalSlug)
    if (index < 0) return { prevSlug: undefined, nextSlug: undefined }
    return {
      prevSlug: index > 0 ? slugs[index - 1] : undefined,
      nextSlug: index < slugs.length - 1 ? slugs[index + 1] : undefined,
    }
  }, [issues, signalSlug])

  const goToSignal = (targetSlug: string | undefined) => {
    if (!targetSlug) return
    void navigate({
      to: "/projects/$projectSlug/signals/$signalSlug",
      params: { projectSlug, signalSlug: targetSlug },
    })
  }

  useHotkeys([
    {
      hotkey: "J",
      callback: () => goToSignal(nextSlug),
      options: { enabled: !!nextSlug && !overlayActive, ignoreInputs: true },
    },
    {
      hotkey: "K",
      callback: () => goToSignal(prevSlug),
      options: { enabled: !!prevSlug && !overlayActive, ignoreInputs: true },
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
            disabled={!prevSlug}
            onClick={() => goToSignal(prevSlug)}
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
            disabled={!nextSlug}
            onClick={() => goToSignal(nextSlug)}
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
