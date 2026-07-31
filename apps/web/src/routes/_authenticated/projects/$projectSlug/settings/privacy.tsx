import {
  hasRedactionField,
  type RedactionIdentityHandling,
  type RedactionMode,
  type RedactionSetting,
  resolveRedactionPolicy,
} from "@domain/shared"
import { Button, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useMembersCollection } from "../../../../../domains/members/members.collection.ts"
import { useOrganizationsCollection } from "../../../../../domains/organizations/organizations.collection.ts"
import {
  updateProjectRedactionMutation,
  useProjectsCollection,
} from "../../../../../domains/projects/projects.collection.ts"
import { decodeEntities, encodeEntities } from "../../../../../domains/projects/redaction-entities.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useDirtyGuard } from "../../../../../lib/hooks/use-dirty-guard.ts"
import { useDraftOverlay } from "../../../../../lib/hooks/use-draft-overlay.ts"
import { useAuthenticatedOrganizationId, useAuthenticatedUser } from "../../../-route-data.ts"
import { useRouteProject } from "../-route-data.ts"
import { DirtyActions } from "./-components/dirty-actions.tsx"
import { OrganizationRedactionModal } from "./-components/organization-redaction-modal.tsx"
import { RedactionCard, type RedactionCardValue } from "./-components/redaction-card.tsx"
import { ScopedSetting, type SettingScope } from "./-components/scoped-setting.tsx"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/privacy")({
  component: ProjectPrivacySettingsPage,
})

interface Draft {
  readonly mode: RedactionMode
  readonly entities: string
  readonly metadata: boolean
  readonly identities: RedactionIdentityHandling
}

const toSetting = (value: RedactionCardValue): RedactionSetting => ({
  mode: value.mode,
  entities: decodeEntities(value.entities),
  scopes: { metadata: value.metadata },
  identities: value.identities,
})

function ProjectPrivacySettingsPage() {
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const organizationId = useAuthenticatedOrganizationId()
  const user = useAuthenticatedUser()
  const [editingDefault, setEditingDefault] = useState(false)

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const currentProject = liveProject ?? routeProject

  const { data: allProjects } = useProjectsCollection()

  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )

  const { data: memberData } = useMembersCollection()
  const myRole = (memberData ?? []).find((member) => member.userId === user.id)?.role
  const isOwner = myRole === "owner"
  const canEditProject = isOwner || myRole === "admin"

  const orgRedaction = org?.settings?.redaction
  const projectRedaction = currentProject.settings.redaction
  const isLocked = orgRedaction?.locked === true

  // Resolved through the same function the ingest pipeline uses, so the card can never
  // describe a policy the engine wouldn't apply.
  const effective = resolveRedactionPolicy({
    organization: org?.settings ?? null,
    project: currentProject.settings,
  })

  // The shared Showcase project is merged into this collection but isn't the org's, so it
  // would inflate both the total and the "in effect for" count.
  const projects = (allProjects ?? []).filter((row) => !row.isShowcase)
  const projectCount = projects.length
  const overrideCount = projects.filter((row) => hasRedactionField(row.settings?.redaction)).length

  const scope: SettingScope = hasRedactionField(projectRedaction) ? "project" : "organization"

  const baseline: Draft = {
    mode: effective.mode,
    entities: encodeEntities(effective.entities),
    metadata: effective.redactMetadata,
    identities: effective.identities,
  }

  const [isApplying, setIsApplying] = useState(false)
  const { view, setField, dirtyCount, hasDirty, reset } = useDraftOverlay(baseline)

  const apply = async () => {
    if (!hasDirty || isApplying) return
    setIsApplying(true)
    try {
      await updateProjectRedactionMutation(currentProject.id, toSetting(view))
      reset()
      toast({ description: "Redaction settings updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  const changeScope = async (next: SettingScope) => {
    setIsApplying(true)
    try {
      // Seeding the override from the effective policy keeps the switch a no-op on behaviour:
      // the project starts from exactly what it was already inheriting.
      await updateProjectRedactionMutation(currentProject.id, next === "project" ? toSetting(view) : null)
      reset()
      toast({
        description:
          next === "project" ? "This project now sets its own policy" : "This project now follows the organization",
      })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  useDirtyGuard({
    hasDirty,
    isApplying,
    confirmMessage: "You have unsaved redaction changes. Leave anyway?",
    onApply: apply,
    onDiscard: reset,
  })

  return (
    <SettingsPage
      title="Privacy"
      description="Strip personal data out of span content before it is stored"
      actions={
        <DirtyActions dirtyCount={dirtyCount} isApplying={isApplying} onApply={() => void apply()} onDiscard={reset} />
      }
      headerSticky={hasDirty}
    >
      <div className="flex w-full flex-col gap-8 @[900px]:w-2/3">
        <Text.H6 color="foregroundMuted">
          Latitude scans span content for the categories you pick and replaces matches with a labelled placeholder
          before storing the span. It applies only to spans ingested from now on, takes effect within a minute, and
          redacted content cannot be recovered. Detection is pattern based: it reliably catches structured identifiers,
          and does not catch names, addresses, or free-form personal detail.
        </Text.H6>

        <ScopedSetting
          idPrefix="project-redaction"
          title="Redact PII in this project"
          description="Scans messages, tool calls, and span attributes as they are ingested."
          isDirty={hasDirty}
          scope={{
            kind: "selectable",
            value: scope,
            loading: isApplying,
            disabled: !canEditProject,
            locked: isLocked,
            onChange: (next) => void changeScope(next),
          }}
          notice={
            isLocked ? (
              <Text.H6 color="foregroundMuted">
                Locked by the organization default, so this project cannot change it. Ask an organization owner if it
                needs to be different here.
              </Text.H6>
            ) : !canEditProject ? (
              <Text.H6 color="foregroundMuted">
                Only organization owners and admins can change the redaction policy.
              </Text.H6>
            ) : scope === "organization" ? (
              <Text.H6 color="foregroundMuted">
                Showing the organization default. Switch to “This project” to give this project its own policy.
              </Text.H6>
            ) : null
          }
          footer={
            <div className="flex flex-row flex-wrap items-center justify-between gap-4">
              <Text.H6 color="foregroundMuted">
                {overrideCount > 0
                  ? `Organization default in effect for ${projectCount - overrideCount} of ${projectCount} projects · ${overrideCount} override it`
                  : `Organization default in effect for all ${projectCount} projects`}
              </Text.H6>
              {isOwner ? (
                <Button variant="outline" onClick={() => setEditingDefault(true)} disabled={isApplying}>
                  Edit default
                </Button>
              ) : null}
            </div>
          }
        >
          <RedactionCard
            idPrefix="project-redaction"
            value={view}
            disabled={isLocked || !canEditProject || scope === "organization"}
            onChange={(key, next) => setField(key, next)}
          />
        </ScopedSetting>
      </div>

      {editingDefault ? (
        <OrganizationRedactionModal
          current={orgRedaction}
          projectCount={projectCount}
          overrideCount={overrideCount}
          onClose={() => setEditingDefault(false)}
        />
      ) : null}
    </SettingsPage>
  )
}
