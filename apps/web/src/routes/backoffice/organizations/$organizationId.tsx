import { Avatar, Badge, Container, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, notFound } from "@tanstack/react-router"
import {
  type AdminOrganizationMemberDto,
  type AdminOrganizationProjectDto,
  adminGetOrganization,
} from "../../../domains/admin/organizations.functions.ts"
import { ProjectRow, UserRow } from "../-components/rows/index.ts"
import { useTrackRecentBackofficeView } from "../-lib/recently-viewed.ts"

export const Route = createFileRoute("/backoffice/organizations/$organizationId")({
  loader: async ({ params }) => {
    try {
      const organization = await adminGetOrganization({ data: { organizationId: params.organizationId } })
      return { organization }
    } catch (error) {
      const tag = (error as { _tag?: string } | null | undefined)?._tag
      if (tag === "NotFoundError") {
        throw notFound()
      }
      throw error
    }
  },
  component: BackofficeOrganizationDetailPage,
})

function BackofficeOrganizationDetailPage() {
  const organization = Route.useLoaderData({ select: (data) => data.organization })

  useTrackRecentBackofficeView({
    kind: "organization",
    id: organization.id,
    primary: organization.name,
    secondary: organization.slug,
  })

  return (
    <Container className="pt-6 pb-10 flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <Avatar name={organization.name} size="lg" />
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          <Text.H3 weight="semibold" ellipsis noWrap>
            {organization.name}
          </Text.H3>
          <Text.H5 color="foregroundMuted" ellipsis noWrap>
            /{organization.slug} · {organization.id}
          </Text.H5>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <Text.H5 weight="semibold">Organization</Text.H5>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border bg-background px-4 py-3">
          <DetailRow label="Organization id" value={organization.id} />
          <DetailRow label="Created" value={relativeTime(organization.createdAt)} />
          <DetailRow label="Slug" value={organization.slug} />
          <DetailRow label="Updated" value={relativeTime(organization.updatedAt)} />
          <DetailRow label="Stripe customer" value={organization.stripeCustomerId ?? "(none)"} />
          <DetailRow label="Members" value={String(organization.members.length)} />
          <DetailRow label="Projects" value={String(organization.projects.length)} />
        </div>
      </section>

      <MembersSection members={organization.members} />
      <ProjectsSection projects={organization.projects} />
    </Container>
  )
}

function MembersSection({ members }: { members: AdminOrganizationMemberDto[] }) {
  return (
    <section className="flex flex-col gap-2">
      <Text.H5 weight="semibold">Members ({members.length})</Text.H5>
      {members.length === 0 ? (
        <div className="rounded-md border border-border bg-background px-4 py-3">
          <Text.H5 color="foregroundMuted">This organization has no members.</Text.H5>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {members.map((member) => (
            <UserRow
              key={member.membershipId}
              user={{
                id: member.user.id,
                email: member.user.email,
                name: member.user.name,
                image: member.user.image,
                role: member.user.role,
                // No memberships chips here — the org context is implicit on this page.
                memberships: [],
              }}
              // Trailing surfaces *both* roles together: per-org role
              // (always) and a small "platform admin" pill when the
              // member is also a global admin. Two badges instead of
              // one because they answer different questions: "what can
              // they do in THIS org?" vs "are they staff?".
              trailing={
                <div className="flex items-center gap-1.5">
                  {member.user.role === "admin" && <Badge variant="destructive">platform admin</Badge>}
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role}</Badge>
                </div>
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ProjectsSection({ projects }: { projects: AdminOrganizationProjectDto[] }) {
  return (
    <section className="flex flex-col gap-2">
      <Text.H5 weight="semibold">Projects ({projects.length})</Text.H5>
      {projects.length === 0 ? (
        <div className="rounded-md border border-border bg-background px-4 py-3">
          <Text.H5 color="foregroundMuted">This organization has no active projects.</Text.H5>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={{
                id: project.id,
                name: project.name,
                slug: project.slug,
                // `organizationName` deliberately omitted — the row is
                // rendered inside the parent org's own detail page, so
                // surfacing the org chip would be redundant. The row
                // secondary line collapses to just the slug.
                createdAt: project.createdAt,
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6 ellipsis>{value}</Text.H6>
    </>
  )
}
