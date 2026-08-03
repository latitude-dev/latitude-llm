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
import { useIsOrganizationOwner, useMembersCollection } from "../../../../../domains/members/members.collection.ts"
import { useOrganizationsCollection } from "../../../../../domains/organizations/organizations.collection.ts"
import {
  updateProjectRedactionMutation,
  useProjectsCollection,
} from "../../../../../domains/projects/projects.collection.ts"
import { decodeEntities, encodeEntities } from "../../../../../domains/projects/redaction-entities.ts"
import { decodeRules, encodeRules } from "../../../../../domains/projects/redaction-rule-drafts.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useDirtyGuard } from "../../../../../lib/hooks/use-dirty-guard.ts"
import { useDraftOverlay } from "../../../../../lib/hooks/use-draft-overlay.ts"
import { useAuthenticatedOrganizationId, useAuthenticatedUser } from "../../../-route-data.ts"
import { useRouteProject } from "../-route-data.ts"
import { DirtyActions } from "./-components/dirty-actions.tsx"
import { OrganizationRedactionModal } from "./-components/organization-redaction-modal.tsx"
import { RedactionCard, type RedactionCardValue } from "./-components/redaction-card.tsx"
import { RedactionPreview } from "./-components/redaction-preview.tsx"
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
  /** Canonical JSON, for the same reason `entities` is a string: the overlay compares by value. */
  readonly rules: string
}

const toSetting = (value: RedactionCardValue): RedactionSetting => ({
  mode: value.mode,
  entities: decodeEntities(value.entities),
  scopes: { metadata: value.metadata },
  identities: value.identities,
  rules: decodeRules(value.rules),
})

/**
 * For the render path, where `toSetting` throwing would take the settings page down with it.
 *
 * `apply` wants the throw — a decode failure there must not be saved as an empty rule list — but
 * the preview is optional, so losing only the preview is the right failure.
 */
const toSettingOrNull = (value: RedactionCardValue): RedactionSetting | null => {
  try {
    return toSetting(value)
  } catch {
    return null
  }
}

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
  const isOwner = useIsOrganizationOwner(user.id)
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

  const storedScope: SettingScope = hasRedactionField(projectRedaction) ? "project" : "organization"
  const [stagedScope, setStagedScope] = useState<SettingScope | null>(null)
  const scope = stagedScope ?? storedScope

  // What the fields show: the organization default when this project follows it, so flipping the
  // selector previews the other layer instead of editing values that wouldn't be saved.
  const orgPolicy = resolveRedactionPolicy({ organization: org?.settings ?? null, project: null })
  const shown = scope === "organization" ? orgPolicy : effective

  const baseline: Draft = {
    mode: shown.mode,
    entities: encodeEntities(shown.entities),
    metadata: shown.redactMetadata,
    identities: shown.identities,
    rules: encodeRules(shown.rules),
  }

  const [isApplying, setIsApplying] = useState(false)
  const { view, setField, dirtyCount, hasDirty, reset } = useDraftOverlay(baseline)

  // Every draft field is a primitive, by the overlay's own design, so this is a stable identity for one.
  const previewKey = JSON.stringify(view)
  const previewSetting = toSettingOrNull(view)

  // Dropping the override is the only destructive direction, so it waits for an explicit apply.
  const pendingRemoval = storedScope === "project" && scope === "organization"
  // Taking ownership is applyable even with no edits: pinning a project to today's values so later
  // organization changes don't reach it is a real intent.
  const pendingOverride = storedScope === "organization" && scope === "project"
  const valueDirty = scope === "project" && (hasDirty || pendingOverride)

  const apply = async () => {
    if (!valueDirty || isApplying) return
    setIsApplying(true)
    try {
      await updateProjectRedactionMutation(currentProject.id, toSetting(view))
      setStagedScope(null)
      reset()
      toast({ description: "Redaction settings updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  const applyRemoval = async () => {
    if (isApplying) return
    setIsApplying(true)
    try {
      await updateProjectRedactionMutation(currentProject.id, null)
      setStagedScope(null)
      reset()
      toast({ description: "This project now follows the organization" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  const discard = () => {
    setStagedScope(null)
    reset()
  }

  const changeScope = (next: SettingScope) => {
    setStagedScope(next === storedScope ? null : next)
    // The baseline swaps between this project's values and the organization default, so pending
    // edits belonging to the other layer would otherwise be spread over it and shown as its own.
    reset()
  }

  useDirtyGuard({
    hasDirty: valueDirty || pendingRemoval,
    isApplying,
    confirmMessage: "You have unsaved redaction changes. Leave anyway?",
    onApply: pendingRemoval ? applyRemoval : apply,
    onDiscard: discard,
  })

  return (
    <SettingsPage
      title="Privacy"
      description="Strip personal data out of span content before it is stored"
      actions={
        <DirtyActions
          dirtyCount={valueDirty ? Math.max(dirtyCount, 1) : 0}
          isApplying={isApplying}
          onApply={() => void apply()}
          onDiscard={discard}
        />
      }
      headerSticky={valueDirty}
    >
      <div className="flex w-full flex-col gap-8 @[900px]:w-2/3">
        {/* The irreversibility and shape-matching caveats live on the card itself now, next to the
            controls they qualify and where the organization modal shows them too. */}
        <Text.H6 color="foregroundMuted">
          Matching values are replaced with a labelled placeholder before the span is stored. A change takes effect
          within a minute.
        </Text.H6>

        <ScopedSetting
          idPrefix="project-redaction"
          title="Redact PII in this project"
          description="Scans messages, tool calls, and span attributes as they are ingested."
          isDirty={valueDirty}
          scope={{
            kind: "selectable",
            value: scope,
            disabled: !canEditProject,
            locked: isLocked,
            onChange: changeScope,
          }}
          pendingChange={
            pendingRemoval
              ? {
                  description: `This project will follow the organization default${orgPolicy.mode === "off" ? ", which is off — it will stop redacting PII" : ""}. Its own policy is discarded. Existing spans are unaffected either way.`,
                  applyLabel: "Follow organization",
                  isApplying,
                  onApply: () => void applyRemoval(),
                  onDiscard: discard,
                }
              : undefined
          }
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
            ) : pendingOverride ? (
              <Text.H6 color="foregroundMuted">
                This project has no policy of its own yet. Apply to copy these values into one, so later changes to the
                organization default won’t reach this project.
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
                  Edit organization default
                </Button>
              ) : scope === "organization" ? (
                <Text.H6 color="foregroundMuted">Ask an owner to change the default.</Text.H6>
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

        {view.mode === "enforce" && previewSetting ? (
          // Keyed on the draft: a result for a policy the user has since edited would be read as current.
          <RedactionPreview
            key={previewKey}
            projectId={currentProject.id}
            disabled={!canEditProject}
            setting={previewSetting}
          />
        ) : null}
      </div>

      {editingDefault ? (
        <OrganizationRedactionModal
          current={orgRedaction}
          projectCount={projectCount}
          overrideCount={overrideCount}
          currentProjectInherits={storedScope === "organization"}
          onClose={() => setEditingDefault(false)}
        />
      ) : null}
    </SettingsPage>
  )
}
