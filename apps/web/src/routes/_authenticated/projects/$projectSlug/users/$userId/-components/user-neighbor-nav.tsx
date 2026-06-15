import { Button, Tooltip } from "@repo/ui"
import { type RegisterableHotkey, useHotkeys } from "@tanstack/react-hotkeys"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { HotkeyBadge } from "../../../../../../../components/hotkey-badge.tsx"
import { useProjectUsers } from "../../../../../../../domains/end-users/end-users.collection.ts"

// Match the users list page's default ordering so prev/next mirror what the user saw.
const NEIGHBOR_SORTING = { column: "lastSeen", direction: "desc" } as const

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
              to="/projects/$projectSlug/users/$userId"
              params={{ projectSlug, userId: target }}
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

/** Prev/next arrows (+ J/K hotkeys) to cycle through users in the list's order. Suppressed while a session drawer is open. */
export function UserNeighborNav({
  projectId,
  projectSlug,
  userId,
  overlayActive,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly userId: string
  readonly overlayActive: boolean
}) {
  const navigate = useNavigate()
  // Shares the list page's query key, so this is a cache hit when arriving from the list.
  const { data: users } = useProjectUsers({ projectId, sorting: NEIGHBOR_SORTING })

  const { prevId, nextId } = useMemo(() => {
    const ids = users.map((user) => user.userId)
    const index = ids.indexOf(userId)
    if (index < 0) return { prevId: undefined, nextId: undefined }
    return {
      prevId: index > 0 ? ids[index - 1] : undefined,
      nextId: index < ids.length - 1 ? ids[index + 1] : undefined,
    }
  }, [users, userId])

  const goToUser = (target: string | undefined) => {
    if (!target) return
    void navigate({
      to: "/projects/$projectSlug/users/$userId",
      params: { projectSlug, userId: target },
      search: (prev: Record<string, unknown>) => prev,
    })
  }

  useHotkeys([
    {
      hotkey: "J",
      callback: () => goToUser(nextId),
      options: { enabled: !!nextId && !overlayActive, ignoreInputs: true },
    },
    {
      hotkey: "K",
      callback: () => goToUser(prevId),
      options: { enabled: !!prevId && !overlayActive, ignoreInputs: true },
    },
  ])

  return (
    <>
      <NeighborButton projectSlug={projectSlug} target={prevId} label="Previous user" hotkey="K">
        <ArrowUpIcon className="h-4 w-4 text-muted-foreground" />
      </NeighborButton>
      <NeighborButton projectSlug={projectSlug} target={nextId} label="Next user" hotkey="J">
        <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
      </NeighborButton>
    </>
  )
}
