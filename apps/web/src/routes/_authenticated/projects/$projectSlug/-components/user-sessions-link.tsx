import { Button } from "@repo/ui"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { MessagesSquareIcon } from "lucide-react"
import { useRegisterCommands } from "../../../../../components/command-palette/command-palette-provider.tsx"
import { useCurrentProject } from "../../../../../components/command-palette/commands/use-current-project.ts"
import { serializeFilters } from "./trace-page-state.ts"

export function UserSessionsLink({ userId }: { readonly userId: string | undefined }) {
  const { projectSlug } = useParams({ strict: false })
  if (!projectSlug || !userId?.trim()) return null

  return (
    <div className="flex">
      <Button asChild variant="outline" size="sm">
        <Link
          to="/projects/$projectSlug"
          params={{ projectSlug }}
          search={{ tab: "sessions", filters: serializeFilters({ userId: [{ op: "eq", value: userId }] }) }}
        >
          View all sessions for this user
        </Link>
      </Button>
    </div>
  )
}

export function UserSessionsPaletteContributor({ userId }: { readonly userId: string | undefined }) {
  const project = useCurrentProject()
  const navigate = useNavigate()
  useRegisterCommands(
    project && userId?.trim()
      ? [
          {
            id: `user:${userId}:view-sessions`,
            title: "View all sessions for this user",
            icon: MessagesSquareIcon,
            section: "context",
            group: "User",
            keywords: "user chats conversations sessions",
            perform: () =>
              navigate({
                to: "/projects/$projectSlug",
                params: { projectSlug: project.slug },
                search: { tab: "sessions", filters: serializeFilters({ userId: [{ op: "eq", value: userId }] }) },
              }),
          },
        ]
      : [],
  )
  return null
}
