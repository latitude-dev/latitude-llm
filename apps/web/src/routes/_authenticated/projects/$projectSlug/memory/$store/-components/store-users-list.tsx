import { Skeleton, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { UserRoundIcon } from "lucide-react"
import { useMemoryStoreUsers } from "../../../../../../../domains/memories/memories.collection.ts"

export function StoreUsersList({
  projectId,
  projectSlug,
  storeId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly storeId: string
}) {
  const { data: users, isLoading } = useMemoryStoreUsers({ projectId, storeId })

  if (isLoading) return <Skeleton className="h-6 w-48" />
  if (!users || users.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Text.H6 color="foregroundMuted" className="mr-0.5">
        Accessed by {users.length === 1 ? "1 user" : `${users.length} users`}
      </Text.H6>
      {users.map((user) => (
        <Link
          key={user.userId}
          to="/projects/$projectSlug/users/$userId"
          params={{ projectSlug, userId: user.userId }}
          className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 transition-colors hover:bg-accent"
        >
          <UserRoundIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Text.H6 noWrap ellipsis className="max-w-[16rem] font-mono">
            {user.userId}
          </Text.H6>
        </Link>
      ))}
    </div>
  )
}
