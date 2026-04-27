import { Text } from "@repo/ui"
import type { AdminSearchDto } from "../../../domains/admin/search.functions.ts"
import { OrganizationRow, ProjectRow, UserRow } from "./rows/index.ts"

interface SearchResultsProps {
  readonly data: AdminSearchDto | undefined
  readonly isLoading: boolean
  readonly query: string
  readonly isQueryTooShort: boolean
}

export function SearchResults({ data, isLoading, query, isQueryTooShort }: SearchResultsProps) {
  if (isQueryTooShort) {
    return (
      <div className="py-12 text-center">
        <Text.H5 color="foregroundMuted">Type at least 2 characters to search.</Text.H5>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <Text.H5 color="foregroundMuted">Searching…</Text.H5>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const total = data.users.length + data.organizations.length + data.projects.length
  if (total === 0) {
    return (
      <div className="py-12 text-center">
        <Text.H5 color="foregroundMuted">No results for &ldquo;{query}&rdquo;.</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
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
 * Section header for a result group: a label-and-count chip on the left
 * with a subtle horizontal rule extending to the right edge. Reads more
 * like a divider than a heading, which matches "search results" rather
 * than "page title."
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
