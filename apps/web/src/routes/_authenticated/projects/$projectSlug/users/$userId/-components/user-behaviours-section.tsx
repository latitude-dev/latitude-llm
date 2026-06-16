import { Badge, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { useUserBehaviours } from "../../../../../../../domains/end-users/end-users.collection.ts"
import { formatAgoLabel } from "../../-components/user-formatters.ts"

export function UserBehavioursSection({
  projectId,
  projectSlug,
  userId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly userId: string
}) {
  const { data: behaviours, isLoading } = useUserBehaviours({ projectId, userId })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!behaviours || behaviours.length === 0) {
    return (
      <div className="flex min-h-16 items-center">
        <Text.H6 color="foregroundMuted">No behaviors have been observed for this user yet.</Text.H6>
      </div>
    )
  }

  return (
    <div className="-mx-2 flex max-h-[min(24rem,45vh)] flex-col overflow-y-auto px-2">
      {behaviours.map((behaviour) => (
        <Link
          key={behaviour.clusterId}
          to="/projects/$projectSlug/behaviours"
          params={{ projectSlug }}
          search={{ behaviourPath: behaviour.clusterId }}
          aria-label={`Open behavior ${behaviour.name}`}
          className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-background"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Text.H5 className="min-w-0" noWrap ellipsis>
              {behaviour.name}
            </Text.H5>
            {behaviour.description ? (
              <Text.H6 color="foregroundMuted" className="min-w-0" noWrap ellipsis>
                {behaviour.description}
              </Text.H6>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge variant="secondary" size="small">
              {formatCount(behaviour.observationCount)}×
            </Badge>
            <div className="flex w-16 justify-end">
              <Text.H6 color="foregroundMuted" noWrap>
                {formatAgoLabel(behaviour.lastObservedAt)}
              </Text.H6>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
