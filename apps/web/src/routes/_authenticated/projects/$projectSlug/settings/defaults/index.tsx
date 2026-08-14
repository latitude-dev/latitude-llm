import { hasRedactionField, resolveRedactionPolicy } from "@domain/shared"
import { Button, Icon, Skeleton, Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { EyeOffIcon, type LucideProps } from "lucide-react"
import { type ComponentType, type ReactNode, useState } from "react"
import {
  GITHUB_ORG_DEFAULTS_QUERY_KEY,
  getGithubOrgDefaults,
} from "../../../../../../domains/github/github.functions.ts"
import { integrationEntry } from "../../../../../../domains/integrations/integration-catalog.ts"
import { useIsOrganizationOwner } from "../../../../../../domains/members/members.collection.ts"
import { useOrganizationsCollection } from "../../../../../../domains/organizations/organizations.collection.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useAuthenticatedOrganizationId, useAuthenticatedUser } from "../../../../-route-data.ts"
import { OrganizationRedactionModal } from "../-components/organization-redaction-modal.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/defaults/")({
  component: OrganizationDefaultsPage,
})

/**
 * The fleet view for every dual-scoped setting: what each organization default is,
 * how many projects deviate, and one place to change it. The only surface where
 * scope is the page's subject rather than a per-setting property.
 */
function OrganizationDefaultsPage() {
  const { projectSlug } = Route.useParams()
  const organizationId = useAuthenticatedOrganizationId()
  const user = useAuthenticatedUser()
  const isOwner = useIsOrganizationOwner(user.id)

  const { data: allProjects } = useProjectsCollection()
  // The shared Showcase project is merged into this collection but isn't the org's.
  const projects = (allProjects ?? []).filter((row) => !row.isShowcase)
  const projectCount = projects.length

  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )

  return (
    <SettingsPage
      title="Defaults"
      description="Organization-wide defaults that projects inherit unless they set their own."
    >
      <div className="flex w-full flex-col gap-6">
        <Text.H6 color="foregroundMuted">
          {isOwner
            ? "Each project can override these on its own settings pages. Changing a default here applies immediately to every project still inheriting it, and leaves projects that override it untouched."
            : "Each project can override these on its own settings pages. Only organization owners can change a default."}
        </Text.H6>

        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          <RedactionDefaultRow
            canEdit={isOwner}
            organizationSettings={org?.settings ?? null}
            projectCount={projectCount}
            overrideCount={projects.filter((row) => hasRedactionField(row.settings?.redaction)).length}
          />

          <GithubDefaultRow projectSlug={projectSlug} projectCount={projectCount} />
        </div>
      </div>
    </SettingsPage>
  )
}

function DefaultRow({
  icon,
  title,
  value,
  projectCount,
  overrideCount,
  action,
}: {
  readonly icon: ComponentType<LucideProps>
  readonly title: string
  readonly value: string
  readonly projectCount: number
  readonly overrideCount: number
  readonly action?: ReactNode
}) {
  return (
    <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
      <div className="flex min-w-0 flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon icon={icon} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text.H5 weight="semibold">{title}</Text.H5>
          <Text.H6 color="foregroundMuted">{value}</Text.H6>
        </div>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-4">
        <Text.H6 color="foregroundMuted">
          {overrideCount > 0
            ? `${projectCount - overrideCount} of ${projectCount} inherit · ${overrideCount} override`
            : `All ${projectCount} inherit`}
        </Text.H6>
        {action}
      </div>
    </div>
  )
}

/** A failed load must not read as "no default set", which is a real and different answer. */
function DefaultRowError({ title }: { readonly title: string }) {
  return (
    <div className="flex flex-row flex-wrap items-center justify-between gap-4 p-4">
      <Text.H5 weight="semibold">{title}</Text.H5>
      <Text.H6 color="destructive">Couldn't load this default. Reload to try again.</Text.H6>
    </div>
  )
}

function RedactionDefaultRow({
  organizationSettings,
  projectCount,
  overrideCount,
  canEdit,
}: {
  readonly canEdit: boolean
  readonly organizationSettings: Parameters<typeof resolveRedactionPolicy>[0]["organization"]
  readonly projectCount: number
  readonly overrideCount: number
}) {
  const [editing, setEditing] = useState(false)
  const redaction = organizationSettings?.redaction
  const policy = resolveRedactionPolicy({ organization: organizationSettings, project: null })

  const value =
    policy.mode === "off"
      ? "Off"
      : `Enforced · ${policy.entities.size} ${policy.entities.size === 1 ? "category" : "categories"}${redaction?.locked ? " · locked" : ""}`

  return (
    <>
      <DefaultRow
        icon={EyeOffIcon}
        title="PII redaction"
        value={value}
        projectCount={projectCount}
        overrideCount={overrideCount}
        action={
          canEdit ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit default
            </Button>
          ) : undefined
        }
      />
      {editing ? (
        <OrganizationRedactionModal
          current={redaction}
          projectCount={projectCount}
          overrideCount={overrideCount}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  )
}

function GithubDefaultRow({
  projectSlug,
  projectCount,
}: {
  readonly projectSlug: string
  readonly projectCount: number
}) {
  // The org default itself, not the route project's effective config — otherwise a project
  // that overrides monitoring would have its values displayed as the organization default.
  const {
    data: defaults,
    isLoading,
    isError,
  } = useQuery({
    queryKey: GITHUB_ORG_DEFAULTS_QUERY_KEY,
    queryFn: () => getGithubOrgDefaults(),
  })

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }
  if (isError) return <DefaultRowError title="GitHub monitoring" />
  if (!defaults) return null

  const watched = [
    defaults.settings.monitorPullRequests ? "pull requests" : null,
    defaults.settings.monitorCommits ? "commits" : null,
  ].filter(Boolean)

  return (
    <DefaultRow
      icon={integrationEntry("github").icon}
      title="GitHub monitoring"
      value={watched.length > 0 ? `Watches ${watched.join(" and ")}` : "Nothing watched"}
      projectCount={projectCount}
      overrideCount={defaults.overrideCount}
      action={
        <Button asChild variant="outline">
          <Link
            to="/projects/$projectSlug/settings/organization/integrations/$integrationSlug"
            params={{ projectSlug, integrationSlug: "github" }}
          >
            Edit default
          </Link>
        </Button>
      }
    />
  )
}
