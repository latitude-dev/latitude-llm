import { Icon, Text } from "@repo/ui"
import { SearchXIcon } from "lucide-react"
import type { AdminSearchDto } from "../../../domains/admin/search.functions.ts"
import { OrganizationRow, ProjectRow, UserRow } from "./rows/index.ts"
import { SearchRowSkeletonStack } from "./search-row-skeleton.tsx"

interface SearchResultsProps {
  readonly data: AdminSearchDto | undefined
  readonly isLoading: boolean
  readonly query: string
  readonly isQueryTooShort: boolean
}

export function SearchResults({ data, isLoading, query, isQueryTooShort }: SearchResultsProps) {
  if (isQueryTooShort) {
    // No-op while the user is still typing the first character. The
    // recently-viewed strip (added in a later commit) renders here
    // instead — for now the omnibox is the only thing on screen.
    return null
  }

  if (isLoading) {
    return (
      <div data-backoffice-results className="flex flex-col gap-1.5">
        <SearchRowSkeletonStack count={4} />
      </div>
    )
  }

  if (!data) {
    return null
  }

  const total = data.users.length + data.organizations.length + data.projects.length
  if (total === 0) {
    return <SearchEmptyState query={query} />
  }

  return (
    <div data-backoffice-results className="flex flex-col gap-6">
      {data.users.length > 0 && (
        <Section title="Users" count={data.users.length}>
          {data.users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </Section>
      )}
      {data.organizations.length > 0 && (
        <Section title="Organizations" count={data.organizations.length}>
          {data.organizations.map((org) => (
            <OrganizationRow key={org.id} organization={org} />
          ))}
        </Section>
      )}
      {data.projects.length > 0 && (
        <Section title="Projects" count={data.projects.length}>
          {data.projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </Section>
      )}
    </div>
  )
}

/**
 * Section header for a result group: a label + count chip with a soft
 * horizontal rule extending to the right edge. Reads like a divider
 * rather than a page heading, which matches "search results" framing.
 */
function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Text.H6 weight="semibold" color="foregroundMuted" noWrap>
          {title}
        </Text.H6>
        <span className="rounded-full bg-muted px-1.5 text-xs leading-5 text-muted-foreground tabular-nums">
          {count}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function SearchEmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon icon={SearchXIcon} size="md" color="foregroundMuted" />
      </div>
      <div className="flex flex-col gap-1">
        <Text.H5 weight="medium">No matches</Text.H5>
        <Text.H6 color="foregroundMuted">
          Nothing found for &ldquo;<span className="font-medium text-foreground">{query}</span>&rdquo;.
        </Text.H6>
      </div>
    </div>
  )
}
