import { Avatar, Badge, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import type {
  AdminOrganizationSearchDto,
  AdminProjectSearchDto,
  AdminSearchDto,
  AdminUserSearchDto,
} from "../../../domains/admin/admin.functions.ts"

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
        <Section title={`Users (${data.users.length})`}>
          {data.users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </Section>
      )}
      {data.organizations.length > 0 && (
        <Section title={`Organizations (${data.organizations.length})`}>
          {data.organizations.map((org) => (
            <OrganizationCard key={org.id} organization={org} />
          ))}
        </Section>
      )}
      {data.projects.length > 0 && (
        <Section title={`Projects (${data.projects.length})`}>
          {data.projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Text.H5 weight="semibold">{title}</Text.H5>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

const MAX_MEMBERSHIP_CHIPS = 3

function UserCard({ user }: { user: AdminUserSearchDto }) {
  const displayName = user.name?.trim() ? user.name : user.email
  const visibleMemberships = user.memberships.slice(0, MAX_MEMBERSHIP_CHIPS)
  const overflowCount = user.memberships.length - visibleMemberships.length

  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
      <Avatar name={displayName} imageSrc={user.image} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <Text.H5 weight="medium" ellipsis noWrap>
            {user.email}
          </Text.H5>
          {user.role === "admin" && <Badge variant="destructive">admin</Badge>}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {user.name ?? "(no name)"}
          </Text.H6>
          {user.memberships.length > 0 && (
            <>
              <Text.H6 color="foregroundMuted">·</Text.H6>
              <div className="flex items-center gap-1 min-w-0">
                {visibleMemberships.map((m) => (
                  <Badge key={m.organizationId} variant="muted">
                    {m.organizationName}
                  </Badge>
                ))}
                {overflowCount > 0 && <Badge variant="muted">+{overflowCount}</Badge>}
              </div>
            </>
          )}
        </div>
      </div>
      <Text.H6 color="foregroundMuted" noWrap>
        {formatDate(user.createdAt)}
      </Text.H6>
    </div>
  )
}

function OrganizationCard({ organization }: { organization: AdminOrganizationSearchDto }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
      <Avatar name={organization.name} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text.H5 weight="medium" ellipsis noWrap>
          {organization.name}
        </Text.H5>
        <Text.H6 color="foregroundMuted" ellipsis noWrap>
          /{organization.slug}
        </Text.H6>
      </div>
      <Text.H6 color="foregroundMuted" noWrap>
        {formatDate(organization.createdAt)}
      </Text.H6>
    </div>
  )
}

function ProjectIcon({ name }: { name: string }) {
  const [emoji, rest] = extractLeadingEmoji(name)
  if (emoji) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white">
        <span className="text-base leading-none">{emoji}</span>
      </div>
    )
  }
  return <Avatar name={rest || name} size="lg" />
}

function ProjectCard({ project }: { project: AdminProjectSearchDto }) {
  const [, nameWithoutEmoji] = extractLeadingEmoji(project.name)
  const displayName = nameWithoutEmoji || project.name

  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
      <ProjectIcon name={project.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text.H5 weight="medium" ellipsis noWrap>
          {displayName}
        </Text.H5>
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="muted">{project.organizationName}</Badge>
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            /{project.slug}
          </Text.H6>
        </div>
      </div>
      <Text.H6 color="foregroundMuted" noWrap>
        {formatDate(project.createdAt)}
      </Text.H6>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return iso
  }
}
