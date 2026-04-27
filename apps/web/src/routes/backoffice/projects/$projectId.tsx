import { Badge, Container, Icon, Text } from "@repo/ui"
import { extractLeadingEmoji, relativeTime } from "@repo/utils"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { ArchiveIcon } from "lucide-react"
import { adminGetProject } from "../../../domains/admin/projects.functions.ts"
import { OrganizationRow } from "../-components/rows/index.ts"
import { useTrackRecentBackofficeView } from "../-lib/recently-viewed.ts"

export const Route = createFileRoute("/backoffice/projects/$projectId")({
  loader: async ({ params }) => {
    try {
      const project = await adminGetProject({ data: { projectId: params.projectId } })
      return { project }
    } catch (error) {
      // Same `_tag`-discriminating error handling as `users/$userId.tsx`
      // and the route-level `guardBackofficeRoute`. NotFound (= "project
      // doesn't exist" or "caller isn't an admin") collapses to the
      // standard 404; everything else (DB outage, connectivity,
      // serialization bug) bubbles to the router error boundary.
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

  // Record the visit so this project shows up in the recently-viewed
  // strip on the search page and as a "viewed Xh ago" indicator on
  // result rows. Cached labels refresh every visit.
  useTrackRecentBackofficeView({
    kind: "project",
    id: project.id,
    primary: project.name,
    secondary: project.organization.name,
  })

  return (
    <Container className="pt-6 pb-10 flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <ProjectHeaderIcon emoji={emoji} name={displayName} />
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Text.H3 weight="semibold" ellipsis noWrap>
              {displayName}
            </Text.H3>
            {project.deletedAt && (
              <Badge variant="muted">
                <Icon icon={ArchiveIcon} size="xs" /> deleted
              </Badge>
            )}
          </div>
          <Text.H5 color="foregroundMuted" ellipsis noWrap>
            /{project.slug} · {project.id}
          </Text.H5>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <Text.H5 weight="semibold">Project</Text.H5>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border bg-background px-4 py-3">
          <DetailRow label="Project id" value={project.id} />
          <DetailRow label="Created" value={relativeTime(project.createdAt)} />
          <DetailRow label="Slug" value={project.slug} />
          <DetailRow label="Last edited" value={relativeTime(project.lastEditedAt)} />
          <DetailRow
            label="First trace"
            value={project.firstTraceAt ? relativeTime(project.firstTraceAt) : "(no traces yet)"}
          />
          <DetailRow label="Updated" value={relativeTime(project.updatedAt)} />
          <DetailRow
            label="Settings · keepMonitoring"
            value={project.settings?.keepMonitoring === true ? "enabled" : "disabled"}
          />
          {project.deletedAt && <DetailRow label="Deleted" value={relativeTime(project.deletedAt)} />}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Text.H5 weight="semibold">Organization</Text.H5>
        <OrganizationRow
          organization={{
            id: project.organization.id,
            name: project.organization.name,
            slug: project.organization.slug,
          }}
          // The default trailing slot is created-at; here we have no
          // org timestamps loaded (we only fetched the join cells we
          // need for navigation), so let the row render without
          // trailing metadata. Keeps the visual identical to a search
          // result row pointing at the same org.
          trailing={null}
        />
      </section>
    </Container>
  )
}

/**
 * Header icon block for a project. Mirrors the row component's
 * `ProjectIcon` but at a larger header scale — emoji-in-card if the
 * project name leads with one, fallback to a plain coloured square
 * with the first letter.
 */
function ProjectHeaderIcon({ emoji, name }: { emoji: string | null; name: string }) {
  if (emoji) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-2xl leading-none">
        {emoji}
      </div>
    )
  }
  const initial = name.trim()[0]?.toUpperCase() ?? "?"
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
      <Text.H3 weight="semibold" color="foregroundMuted">
        {initial}
      </Text.H3>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6>{value}</Text.H6>
    </>
  )
}
