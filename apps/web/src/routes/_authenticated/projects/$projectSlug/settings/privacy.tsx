import {
  DEFAULT_REDACTION_ENTITIES,
  type OrganizationRedactionSetting,
  type RedactionIdentityHandling,
  type RedactionMode,
  type RedactionSetting,
  resolveRedactionPolicy,
} from "@domain/shared"
import { Alert, Button, Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useMembersCollection } from "../../../../../domains/members/members.collection.ts"
import {
  updateOrganizationRedactionMutation,
  useOrganizationsCollection,
} from "../../../../../domains/organizations/organizations.collection.ts"
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
import { RedactionCard, type RedactionCardValue } from "./-components/redaction-card.tsx"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/privacy")({
  component: ProjectPrivacySettingsPage,
})

interface Draft {
  readonly projectMode: RedactionMode
  readonly projectEntities: string
  readonly projectMetadata: boolean
  readonly projectIdentities: RedactionIdentityHandling
  readonly orgMode: RedactionMode
  readonly orgEntities: string
  readonly orgMetadata: boolean
  readonly orgIdentities: RedactionIdentityHandling
  readonly orgLocked: boolean
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

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const currentProject = liveProject ?? routeProject

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

  const baseline: Draft = {
    projectMode: effective.mode,
    projectEntities: encodeEntities(effective.entities),
    projectMetadata: effective.redactMetadata,
    projectIdentities: effective.identities,
    orgMode: orgRedaction?.mode ?? "off",
    orgEntities: encodeEntities(orgRedaction?.entities ?? DEFAULT_REDACTION_ENTITIES),
    orgMetadata: orgRedaction?.scopes?.metadata ?? false,
    orgIdentities: orgRedaction?.identities ?? "keep",
    orgLocked: orgRedaction?.locked ?? false,
  }

  const [isApplying, setIsApplying] = useState(false)
  const { view, setField, dirtyFields, dirtyCount, hasDirty, reset } = useDraftOverlay(baseline)

  const projectIsDirty = dirtyFields.some((field) => field.startsWith("project"))
  const orgIsDirty = dirtyFields.some((field) => field.startsWith("org"))

  const apply = async () => {
    if (!hasDirty || isApplying) return
    setIsApplying(true)
    try {
      // Organization first: under `locked` it decides what the project policy even means,
      // so applying it second could leave the two briefly contradicting each other.
      if (orgIsDirty) {
        const setting: OrganizationRedactionSetting = {
          ...toSetting({
            mode: view.orgMode,
            entities: view.orgEntities,
            metadata: view.orgMetadata,
            identities: view.orgIdentities,
          }),
          locked: view.orgLocked,
        }
        await updateOrganizationRedactionMutation(setting)
      }
      if (projectIsDirty) {
        await updateProjectRedactionMutation(
          currentProject.id,
          toSetting({
            mode: view.projectMode,
            entities: view.projectEntities,
            metadata: view.projectMetadata,
            identities: view.projectIdentities,
          }),
        )
      }
      reset()
      toast({ description: "Redaction settings updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsApplying(false)
    }
  }

  const clearProjectOverride = async () => {
    setIsApplying(true)
    try {
      await updateProjectRedactionMutation(currentProject.id, null)
      reset()
      toast({ description: "Project now follows the organization policy" })
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
      <div className="flex w-full flex-col gap-6 @[900px]:w-2/3">
        <Alert
          variant="warning"
          title="Redaction cannot be undone"
          description="Latitude scans span content for the categories you pick and replaces matches with a labelled placeholder before storing the span. It applies only to spans ingested from now on, takes effect within a minute, and redacted content cannot be recovered. Detection is pattern based: it reliably catches structured identifiers, and does not catch names, addresses, or free-form personal detail."
        />

        <RedactionCard
          idPrefix="project-redaction"
          title="Redact PII in this project"
          description="Scans messages, tool calls, and span attributes as they are ingested."
          value={{
            mode: view.projectMode,
            entities: view.projectEntities,
            metadata: view.projectMetadata,
            identities: view.projectIdentities,
          }}
          isDirty={projectIsDirty}
          disabled={isLocked || !canEditProject}
          notice={
            isLocked ? (
              <Text.H6 color="foregroundMuted">
                Locked by the organization policy, so this project cannot change it. Ask an organization owner if it
                needs to be different here.
              </Text.H6>
            ) : !canEditProject ? (
              <Text.H6 color="foregroundMuted">
                Only organization owners and admins can change the redaction policy.
              </Text.H6>
            ) : effective.source === "organization" ? (
              <Text.H6 color="foregroundMuted">
                Following the organization policy. Changing anything here creates a project override.
              </Text.H6>
            ) : null
          }
          footer={
            projectRedaction && !isLocked && canEditProject ? (
              <div className="flex flex-row items-center justify-between gap-4">
                <Text.H6 color="foregroundMuted">
                  This project overrides the organization policy. Existing spans are unaffected either way.
                </Text.H6>
                <Button variant="outline" onClick={() => void clearProjectOverride()} disabled={isApplying}>
                  Follow organization
                </Button>
              </div>
            ) : null
          }
          onChange={(key, next) => {
            if (key === "mode") setField("projectMode", next as RedactionMode)
            if (key === "entities") setField("projectEntities", next as string)
            if (key === "metadata") setField("projectMetadata", next as boolean)
            if (key === "identities") setField("projectIdentities", next as RedactionIdentityHandling)
          }}
        />

        {isOwner ? (
          <RedactionCard
            idPrefix="org-redaction"
            title="Organization-wide policy"
            description="A default for every project in the organization. Owners only."
            value={{
              mode: view.orgMode,
              entities: view.orgEntities,
              metadata: view.orgMetadata,
              identities: view.orgIdentities,
            }}
            isDirty={orgIsDirty}
            footer={
              <div className="flex flex-row items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="org-redaction-locked">Prevent projects from weakening this</Label>
                  <Text.H6 color="foregroundMuted">
                    When locked, project settings are ignored entirely rather than merged, and only an owner can change
                    the policy back.
                  </Text.H6>
                </div>
                <Switch
                  id="org-redaction-locked"
                  checked={view.orgLocked}
                  onCheckedChange={(checked) => setField("orgLocked", checked)}
                />
              </div>
            }
            onChange={(key, next) => {
              if (key === "mode") setField("orgMode", next as RedactionMode)
              if (key === "entities") setField("orgEntities", next as string)
              if (key === "metadata") setField("orgMetadata", next as boolean)
              if (key === "identities") setField("orgIdentities", next as RedactionIdentityHandling)
            }}
          />
        ) : null}
      </div>
    </SettingsPage>
  )
}
