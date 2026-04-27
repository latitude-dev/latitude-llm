import { Badge, Icon, Text } from "@repo/ui"
import { extractLeadingEmoji, relativeTime } from "@repo/utils"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArchiveIcon, ArrowRightIcon, CheckIcon, MinusIcon } from "lucide-react"
import { adminGetProject } from "../../../domains/admin/projects.functions.ts"
import {
  DashboardHero,
  DashboardSection,
  DashboardSplit,
  FactRow,
  PropertiesStrip,
} from "../-components/dashboard/index.ts"
import { useTrackRecentBackofficeView } from "../-lib/recently-viewed.ts"

export const Route = createFileRoute("/backoffice/projects/$projectId")({
  loader: async ({ params }) => {
    try {
      const project = await adminGetProject({ data: { projectId: params.projectId } })
      return { project }
    } catch (error) {
      // Same `_tag`-discriminating error handling as the other detail
      // pages: NotFound (= "project doesn't exist" or "caller isn't an
      // admin") collapses to the standard 404; everything else (DB
      // outage, connectivity, serialization bug) bubbles to the router
      // error boundary so ops can see it.
      const tag = (error as { _tag?: string } | null | undefined)?._tag
      if (tag === "NotFoundError") {
        throw notFound()
      }
      throw error
    }
  },
  component: BackofficeProjectDetailPage,
})

function BackofficeProjectDetailPage() {
  const project = Route.useLoaderData({ select: (data) => data.project })
  const [emoji, nameWithoutEmoji] = extractLeadingEmoji(project.name)
  const displayName = nameWithoutEmoji || project.name

  // Record the visit so this project surfaces in the recently-viewed
  // strip + per-row "viewed Xh ago" indicator on subsequent searches.
  // Cached labels (`primary` / `secondary`) refresh every visit so
  // chip captions stay in sync if the project is renamed.
  useTrackRecentBackofficeView({
    kind: "project",
    id: project.id,
    primary: project.name,
    secondary: project.organization.name,
  })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-8 pb-12">
      <DashboardHero
        leading={<ProjectHeroIcon emoji={emoji} name={displayName} />}
        title={displayName}
        badges={
          project.deletedAt ? (
            <Badge variant="muted">
              <Icon icon={ArchiveIcon} size="xs" /> deleted
            </Badge>
          ) : null
        }
        meta={
          <>
            <span>/{project.slug}</span>
            <span aria-hidden="true">·</span>
            <span>
              in{" "}
              <Link
                to="/backoffice/organizations/$organizationId"
                params={{ organizationId: project.organization.id }}
                className="font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
              >
                {project.organization.name}
              </Link>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              last edited <span className="font-medium text-foreground">{relativeTime(project.lastEditedAt)}</span>
            </span>
          </>
        }
      />

      <DashboardSplit
        primary={
          <DashboardSection title="Activity">
            <FactRow label="Created" value={relativeTime(project.createdAt)} />
            <FactRow
              label="First trace"
              value={
                project.firstTraceAt ? (
                  relativeTime(project.firstTraceAt)
                ) : (
                  <Text.H6 color="foregroundMuted">(no traces yet)</Text.H6>
                )
              }
            />
            <FactRow label="Last edited" value={relativeTime(project.lastEditedAt)} />
            <FactRow label="Updated" value={relativeTime(project.updatedAt)} />
            {project.deletedAt && <FactRow label="Deleted" value={relativeTime(project.deletedAt)} />}
          </DashboardSection>
        }
        secondary={
          <DashboardSection title="Settings">
            <FactRow
              label="Monitoring"
              value={
                project.settings?.keepMonitoring === true ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon icon={CheckIcon} size="xs" />
                    <Text.H6>enabled</Text.H6>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Icon icon={MinusIcon} size="xs" color="foregroundMuted" />
                    <Text.H6 color="foregroundMuted">disabled</Text.H6>
                  </span>
                )
              }
            />
          </DashboardSection>
        }
      />

      <DashboardSection
        title="Organization"
        aside={
          <Link
            to="/backoffice/organizations/$organizationId"
            params={{ organizationId: project.organization.id }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            View
            <Icon icon={ArrowRightIcon} size="xs" />
          </Link>
        }
      >
        <Link
          to="/backoffice/organizations/$organizationId"
          params={{ organizationId: project.organization.id }}
          className="-m-1 flex items-center gap-3 rounded-md p-1 transition-colors hover:bg-muted/60"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Text.H6 weight="semibold" color="foregroundMuted">
              {project.organization.name.trim()[0]?.toUpperCase() ?? "?"}
            </Text.H6>
          </div>
          <div className="flex min-w-0 flex-col">
            <Text.H5 weight="medium" ellipsis noWrap>
              {project.organization.name}
            </Text.H5>
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              /{project.organization.slug}
            </Text.H6>
          </div>
        </Link>
      </DashboardSection>

      <PropertiesStrip
        entries={[
          { label: "Project id", value: project.id },
          { label: "Org id", value: project.organization.id },
          { label: "Created", value: new Date(project.createdAt).toISOString() },
          { label: "Updated", value: new Date(project.updatedAt).toISOString() },
        ]}
      />
    </div>
  )
}

/**
 * Header icon for a project. Emoji-in-card if the project name leads
 * with one (mirrors the search-results row shape but at hero scale),
 * otherwise a coloured letter block.
 */
function ProjectHeroIcon({ emoji, name }: { emoji: string | null; name: string }) {
  if (emoji) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-3xl leading-none">
        {emoji}
      </div>
    )
  }
  const initial = name.trim()[0]?.toUpperCase() ?? "?"
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
      <Text.H2 weight="semibold" color="foregroundMuted">
        {initial}
      </Text.H2>
    </div>
  )
}
