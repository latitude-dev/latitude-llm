import {
  AGENT_DISPATCH_TRIGGERS,
  type AgentDispatchTrigger,
  type StoredAgentDispatchTarget,
} from "@domain/agent-dispatch"
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CloseTrigger,
  CopyableText,
  CopyButton,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Label,
  Modal,
  Select,
  Skeleton,
  Text,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { BookOpen, Copy, ExternalLink, FileText } from "lucide-react"
import { type ReactNode, useState } from "react"
import { z } from "zod"
import {
  type AgentDispatchConfigRecord,
  type AgentDispatchIntegrationRecord,
  type AgentDispatchRecord,
  connectClaudeIntegration,
  connectCursorIntegration,
  connectLinearIntegration,
  connectWebhookIntegration,
  disconnectAgentDispatchIntegration,
  getOrgDefaultDispatchConfig,
  getProjectDispatchSettings,
  getWebhookSecret,
  listAgentDispatches,
  listAgentDispatchIntegrations,
  listCursorRepositories,
  listCursorRepositoriesForApiKey,
  listLinearMembers,
  listLinearTeams,
  listLinearTeamsForApiKey,
  resetProjectDispatchOverride,
  sendToDestinationsQueryKey,
  upsertOrgDefaultDispatchConfig,
  upsertProjectDispatchOverride,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
  type AgentDispatchKindKey,
} from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
import { useDebounce } from "../../../../../../lib/hooks/useDebounce.ts"
import { maskSensitiveValue } from "../../../../../../lib/mask-sensitive-value.ts"
import { OrgDefaultBlastRadius, otherAffectedProjects, useOrgDefaultConfirm } from "./org-default-confirm.tsx"

export const AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY = ["agent-dispatch-integrations"] as const

export const orgDefaultConfigQueryKey = (kind: string) => ["agent-dispatch-config-default", kind] as const

export const projectDispatchSettingsQueryKey = (projectId: string, kind: string) =>
  ["agent-dispatch-project-settings", projectId, kind] as const

export interface DispatchConfigFormValues {
  readonly triggers: readonly AgentDispatchTrigger[]
  readonly target: StoredAgentDispatchTarget
  readonly guardrails: { readonly maxDispatchesPerDay: number; readonly cooldownMinutes: number }
}

const KIND_LABELS = AGENT_DISPATCH_KIND_LABELS

const DEEP_LINK_LABELS: Record<AgentDispatchKindKey, string> = {
  cursor: "View in Cursor",
  claude_code: "View in Claude",
  linear: "View Linear issue",
  webhook: "View delivery",
}

export const DISPATCH_ERROR_TITLES: Record<string, string> = {
  auth: "Authentication error",
  config: "Dispatch request rejected",
  rate_limited: "Rate limited",
  transport: "Network error",
}

const DISPATCH_ERROR_FALLBACKS: Record<string, string> = {
  auth: "The integration credentials were rejected. Reconnect the integration and try again.",
  config: "The provider rejected the dispatch request. New failures include the provider response here.",
  rate_limited: "The provider rate-limited this dispatch. It should retry automatically.",
  transport: "The provider could not be reached. It should retry automatically.",
}

function getDispatchErrorTitle(dispatch: AgentDispatchRecord): string | null {
  if (!dispatch.errorCategory) return null
  return DISPATCH_ERROR_TITLES[dispatch.errorCategory] ?? dispatch.errorCategory
}

function getDispatchErrorDetail(dispatch: AgentDispatchRecord): string | null {
  const genericErrorDetail = dispatch.errorCategory ? `Agent dispatch adapter failed (${dispatch.errorCategory})` : null
  if (dispatch.errorDetail && dispatch.errorDetail !== genericErrorDetail) {
    return dispatch.errorDetail
  }
  if (dispatch.errorCategory) {
    return DISPATCH_ERROR_FALLBACKS[dispatch.errorCategory] ?? null
  }
  return null
}

function DispatchErrorDetailModal({
  title,
  detail,
  onClose,
}: {
  readonly title: string
  readonly detail: string
  readonly onClose: () => void
}) {
  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title={title}
      description="Full error response from the provider."
      footer={<CloseTrigger />}
    >
      <div className="group relative">
        <div className="absolute top-0 right-0 z-10 rounded-tr-md rounded-bl-lg bg-muted p-0.5">
          <CopyButton value={detail} tooltip="Copy" />
        </div>
        <textarea
          readOnly
          value={detail}
          className="max-h-80 min-h-32 w-full resize-none rounded-md bg-muted p-3 pr-12 font-mono text-xs leading-relaxed"
        />
      </div>
    </Modal>
  )
}

const INTEGRATION_DOC_URLS: Record<AgentDispatchKindKey, string> = {
  cursor: "https://docs.latitude.so/agent-dispatch/cursor",
  claude_code: "https://docs.latitude.so/agent-dispatch/claude-code",
  linear: "https://docs.latitude.so/agent-dispatch/linear",
  webhook: "https://docs.latitude.so/agent-dispatch/webhooks",
}

const ACTIVE_DISPATCH_TRIGGERS = [
  "signal.discovered",
  "incident.opened",
  "signal.regressed",
  "monitor.incident",
] as const

export const DISPATCH_TRIGGER_TITLES: Record<string, string> = {
  "signal.discovered": "New signal",
  "incident.opened": "Escalating signal",
  "signal.regressed": "Regressed signal",
  "monitor.incident": "Monitor incident",
  manual: "Manual send",
}

const TRIGGER_LABELS: Record<(typeof ACTIVE_DISPATCH_TRIGGERS)[number], { title: string; description: string }> = {
  "signal.discovered": {
    title: "New signal",
    description: "Dispatch when Latitude discovers a new signal.",
  },
  "incident.opened": {
    title: "Escalating signal",
    description: "Dispatch when a signal escalates into an incident.",
  },
  "signal.regressed": {
    title: "Regressed signal",
    description: "Dispatch when a resolved signal starts occurring again.",
  },
  "monitor.incident": {
    title: "Monitor incident",
    description: "Dispatch when a threshold or escalating monitor opens an incident.",
  },
}

function isActiveDispatchTrigger(trigger: string): trigger is (typeof ACTIVE_DISPATCH_TRIGGERS)[number] {
  return ACTIVE_DISPATCH_TRIGGERS.some((activeTrigger) => activeTrigger === trigger)
}

const CLAUDE_ROUTINE_TEMPLATE =
  "Inspect the Latitude signal, identify the regression or newly discovered issue, implement the fix, run the relevant checks, and report what changed."

function IntegrationDocsButton({
  kind,
  fullWidth = false,
  variant = "outline",
}: {
  readonly kind: AgentDispatchKindKey
  readonly fullWidth?: boolean
  readonly variant?: "outline" | "ghost"
}) {
  return (
    <Button asChild variant={variant} size="sm" className={fullWidth ? "w-full" : "shrink-0"}>
      <a href={INTEGRATION_DOC_URLS[kind]} target="_blank" rel="noreferrer">
        <Icon icon={BookOpen} size="sm" />
        Setup guide
      </a>
    </Button>
  )
}

function extractClaudeRoutineTriggerId(routineUrl: string) {
  return routineUrl.trim().match(/\/routines\/(trig_[^/?#]+)/)?.[1] ?? null
}

export function AgentDispatchIntegrationDetails({
  projectId,
  projectSlug,
  kind,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly kind: AgentDispatchKindKey
}) {
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
    queryFn: () => listAgentDispatchIntegrations(),
  })
  const integration = integrations.find((row: AgentDispatchIntegrationRecord) => row.kind === kind) ?? null

  if (isLoading) return <Skeleton className="h-32 w-full" />

  if (!integration) {
    return (
      <Alert
        variant="default"
        showIcon
        title={`${KIND_LABELS[kind]} is not connected`}
        description="Connect it from the integrations page to configure it."
        cta={
          <Button asChild variant="outline">
            <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
              Back to integrations
            </Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <DispatchConnectionSection
        kind={kind}
        integration={integration}
        projectId={projectId}
        projectSlug={projectSlug}
        canDisconnect={false}
      />
      <DispatchBehaviorSection kind={kind} integration={integration} projectId={projectId} />
      <AgentDispatchHistorySection projectId={projectId} projectSlug={projectSlug} kind={kind} />
    </div>
  )
}

export function DispatchConnectionSection({
  kind,
  integration,
  projectId,
  projectSlug,
  canDisconnect,
}: {
  readonly kind: AgentDispatchKindKey
  readonly integration: AgentDispatchIntegrationRecord
  readonly projectId: string
  readonly projectSlug: string
  /** Disconnecting is org-wide, so only the Defaults page — not a single project — can do it. */
  readonly canDisconnect: boolean
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectAgentDispatchIntegration({ data: { integrationId: integration.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: orgDefaultConfigQueryKey(kind) })
      await queryClient.invalidateQueries({ queryKey: projectDispatchSettingsQueryKey(projectId, kind) })
      await queryClient.invalidateQueries({ queryKey: sendToDestinationsQueryKey(projectId) })
      toast({ description: `${KIND_LABELS[kind]} disconnected` })
      setConfirmOpen(false)
    },
    onError: (error) => {
      setConfirmOpen(false)
      toast({ variant: "destructive", description: toUserMessage(error) })
    },
  })

  return (
    <>
      <div className="flex w-full flex-col rounded-lg bg-muted/30">
        <div className="flex w-full flex-col gap-1 p-5">
          <Text.H5M>Connection</Text.H5M>
          <Text.H6 color="foregroundMuted">Shared by every project in your organization.</Text.H6>
        </div>
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-4 border-border border-t p-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H5 weight="semibold">{integration.vendorAccountId}</Text.H5>
            <Text.H6 color="foregroundMuted">Connected {relativeTime(new Date(integration.installedAt))}</Text.H6>
          </div>
          {canDisconnect ? (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Disconnect
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <Link
                to="/projects/$projectSlug/settings/global-integrations/$integrationKind"
                params={{ projectSlug, integrationKind: kind }}
              >
                Manage in Global integrations →
              </Link>
            </Button>
          )}
        </div>
        <div className="flex flex-row flex-wrap items-center justify-between gap-4 border-border border-t p-5">
          <Text.H6 color="foregroundMuted">Setup, dispatch behavior, and troubleshooting for this integration.</Text.H6>
          <IntegrationDocsButton kind={kind} />
        </div>
      </div>

      {confirmOpen ? (
        <Modal
          open
          dismissible
          onOpenChange={(next) => {
            if (!next && !disconnectMutation.isPending) setConfirmOpen(false)
          }}
          title={`Disconnect ${KIND_LABELS[kind]}`}
          description={`Latitude will stop dispatching to ${KIND_LABELS[kind]}, and the organization default plus every project override for it are removed. This affects every project in the organization.`}
          footer={
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={disconnectMutation.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                isLoading={disconnectMutation.isPending}
                disabled={disconnectMutation.isPending}
              >
                Disconnect {KIND_LABELS[kind]}
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  )
}

function DispatchBehaviorSection({
  kind,
  integration,
  projectId,
}: {
  readonly kind: AgentDispatchKindKey
  readonly integration: AgentDispatchIntegrationRecord
  readonly projectId: string
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: projectDispatchSettingsQueryKey(projectId, kind),
    queryFn: () => getProjectDispatchSettings({ data: { projectId, kind } }),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: projectDispatchSettingsQueryKey(projectId, kind) })
    await queryClient.invalidateQueries({ queryKey: sendToDestinationsQueryKey(projectId) })
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />

  const effective = settings?.effective ?? null
  const isOverridden = settings?.override != null

  const applyReset = async () => {
    setIsResetting(true)
    try {
      await resetProjectDispatchOverride({ data: { projectId, integrationId: integration.id } })
      setConfirmingReset(false)
      await invalidate()
      toast({ description: "This project now follows the organization default" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="flex w-full flex-col rounded-lg bg-muted/30">
      <div className="flex w-full flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <Text.H5M>Dispatch behavior</Text.H5M>
            <Badge variant={isOverridden ? "warningMuted" : "outlineMuted"} size="normal">
              {isOverridden ? "Differs from default" : "Using default"}
            </Badge>
          </div>
          <Text.H6 color="foregroundMuted">When Latitude dispatches to this integration, and what it sends.</Text.H6>
        </div>
        {isOverridden ? (
          <Button variant="outline" onClick={() => setConfirmingReset(true)} disabled={isResetting}>
            Reset to default
          </Button>
        ) : null}
      </div>

      {confirmingReset ? (
        <div className="flex flex-row flex-wrap items-center justify-between gap-4 border-border border-t bg-warning-muted/40 p-5">
          <Text.H6 color="foregroundMuted">
            This discards this project's custom dispatch behavior and goes back to following the organization default.
          </Text.H6>
          <div className="flex shrink-0 flex-row items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmingReset(false)} disabled={isResetting}>
              Cancel
            </Button>
            <Button onClick={() => void applyReset()} isLoading={isResetting}>
              Reset to default
            </Button>
          </div>
        </div>
      ) : null}

      {!isOverridden ? (
        <div className="border-border border-t p-5">
          <Text.H6 color="foregroundMuted">
            Editing and saving creates a custom dispatch behavior for this project — it never changes the organization
            default.
          </Text.H6>
        </div>
      ) : null}

      <div className="flex w-full flex-col border-border border-t p-5">
        <AgentDispatchConfigFormInner
          key={`${kind}:${effective?.updatedAt ?? "new"}`}
          kind={kind}
          integrationId={integration.id}
          vendorAccountId={integration.vendorAccountId}
          initial={effective}
          webhookSecret={null}
          submitLabel="Save for this project"
          onSubmit={async (values) => {
            await upsertProjectDispatchOverride({
              data: {
                projectId,
                integrationId: integration.id,
                kind,
                enabled: values.triggers.length > 0,
                triggers: values.triggers,
                target: values.target,
                guardrails: values.guardrails,
              },
            })
            await invalidate()
            toast({ description: `${KIND_LABELS[kind]} settings saved for this project` })
          }}
        />
      </div>
    </div>
  )
}

export function OrgDispatchDefaultCard({
  kind,
  integrationId,
  vendorAccountId,
  projectCount,
  overrideCount,
  canEdit,
}: {
  readonly kind: AgentDispatchKindKey
  readonly integrationId: string
  readonly vendorAccountId: string
  readonly projectCount: number
  readonly overrideCount: number
  readonly canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: config, isLoading } = useQuery({
    queryKey: orgDefaultConfigQueryKey(kind),
    queryFn: () => getOrgDefaultDispatchConfig({ data: { kind } }),
  })

  const otherAffected = otherAffectedProjects({ projectCount, overrideCount, currentProjectInherits: false })
  const confirm = useOrgDefaultConfirm(otherAffected)

  return (
    <div className="flex w-full flex-col rounded-lg bg-muted/30">
      <div className="flex w-full flex-row items-center gap-3 p-5">
        <Icon icon={AGENT_DISPATCH_KIND_ICONS[kind]} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text.H5M>{KIND_LABELS[kind]}</Text.H5M>
          <Text.H6 color="foregroundMuted">{vendorAccountId}</Text.H6>
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 border-border border-t p-5">
        <OrgDefaultBlastRadius
          projectCount={projectCount}
          overrideCount={overrideCount}
          otherAffected={otherAffected}
          awaitingConfirm={confirm.awaitingConfirm}
        />

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <AgentDispatchConfigFormInner
            key={config ? `${config.id}:${config.updatedAt}` : "new"}
            kind={kind}
            integrationId={integrationId}
            vendorAccountId={vendorAccountId}
            initial={config ?? null}
            webhookSecret={null}
            readOnly={!canEdit}
            submitLabel={confirm.submitLabel}
            beforeSubmit={confirm.gate}
            onSubmit={async (values) => {
              await upsertOrgDefaultDispatchConfig({
                data: {
                  integrationId,
                  kind,
                  enabled: values.triggers.length > 0,
                  triggers: values.triggers,
                  target: values.target,
                  guardrails: values.guardrails,
                },
              })
              await queryClient.invalidateQueries({ queryKey: orgDefaultConfigQueryKey(kind) })
              await queryClient.invalidateQueries({ queryKey: ["agent-dispatch-project-settings"] })
              await queryClient.invalidateQueries({ queryKey: ["send-to-destinations"] })
              toast({ description: "Organization default updated" })
            }}
          />
        )}
      </div>

      <div className="flex flex-row flex-wrap items-center justify-between gap-4 border-border border-t p-5">
        <Text.H6 color="foregroundMuted">
          {overrideCount > 0
            ? `Organization default in effect for ${projectCount - overrideCount} of ${projectCount} projects · ${overrideCount} override it`
            : `Organization default in effect for all ${projectCount} projects`}
        </Text.H6>
      </div>
    </div>
  )
}

export function AgentDispatchConfigFormInner({
  kind,
  integrationId,
  vendorAccountId,
  initial,
  webhookSecret,
  readOnly = false,
  submitLabel = "Save settings",
  extraActions,
  beforeSubmit,
  onSubmit,
}: {
  readonly kind: AgentDispatchKindKey
  readonly integrationId: string
  readonly vendorAccountId: string
  readonly initial: AgentDispatchConfigRecord | null
  readonly webhookSecret: string | null
  readonly readOnly?: boolean
  readonly submitLabel?: string
  readonly extraActions?: ReactNode
  /** Returning false aborts the save, for a caller that needs to confirm first. */
  readonly beforeSubmit?: () => boolean
  readonly onSubmit: (values: DispatchConfigFormValues) => Promise<void>
}) {
  const target = initial?.target
  const visibleTriggers = ACTIVE_DISPATCH_TRIGGERS.filter((trigger) => {
    if (kind === "linear") return trigger === "signal.discovered"
    return true
  })
  const { data: cursorRepositories = [], isLoading: cursorRepositoriesLoading } = useQuery({
    queryKey: ["cursor-repositories", integrationId],
    queryFn: () => listCursorRepositories({ data: { integrationId } }),
    enabled: kind === "cursor",
  })
  const cursorRepositoryOptions = cursorRepositories.map((repo) => ({
    label: `${repo.owner}/${repo.name}`,
    value: repo.repository,
  }))
  const { data: linearMembers = [], isLoading: linearMembersLoading } = useQuery({
    queryKey: ["linear-members", integrationId],
    queryFn: () => listLinearMembers({ data: { integrationId } }),
    enabled: kind === "linear",
  })
  const { data: linearTeams = [], isLoading: linearTeamsLoading } = useQuery({
    queryKey: ["linear-teams", integrationId],
    queryFn: () => listLinearTeams({ data: { integrationId } }),
    enabled: kind === "linear",
  })
  const { data: storedWebhookSecret } = useQuery({
    queryKey: ["webhook-secret", integrationId],
    queryFn: () => getWebhookSecret({ data: { integrationId } }),
    enabled: kind === "webhook",
  })
  const linearMemberOptions = linearMembers.map((member) => ({
    label: member.email ? `${member.name} (${member.email})` : member.name,
    value: member.id,
  }))
  const linearTeamOptions = linearTeams.map((team) => ({
    label: `${team.name} (${team.key})`,
    value: team.id,
  }))
  const effectiveWebhookSecret = webhookSecret ?? storedWebhookSecret?.webhookSecret ?? null
  const form = useForm({
    defaultValues: {
      enabled: initial?.enabled ?? false,
      triggers:
        initial?.enabled === false
          ? []
          : (initial?.triggers.filter(
              (trigger) => isActiveDispatchTrigger(trigger) && visibleTriggers.includes(trigger),
            ) ?? ["signal.discovered"]),
      maxDispatchesPerDay: initial?.guardrails.maxDispatchesPerDay ?? 10,
      cooldownMinutes: initial?.guardrails.cooldownMinutes ?? 60,
      repoUrl: kind === "cursor" && target && "repoUrl" in target ? target.repoUrl : "",
      startingRef: kind === "cursor" && target && "startingRef" in target ? (target.startingRef ?? "") : "",
      routineTriggerId:
        kind === "claude_code" && target && "routineTriggerId" in target
          ? target.routineTriggerId
          : kind === "claude_code"
            ? (vendorAccountId.match(/^claude:(trig_.+)$/)?.[1] ?? "")
            : "",
      teamId:
        kind === "linear" && target && "teamId" in target
          ? target.teamId
          : kind === "linear"
            ? (vendorAccountId.match(/^linear:(.+)$/)?.[1] ?? "")
            : "",
      assigneeId: kind === "linear" && target && "assigneeId" in target ? (target.assigneeId ?? "") : "",
      webhookUrl:
        kind === "webhook" && target
          ? "webhookUrl" in target
            ? target.webhookUrl
            : "url" in target
              ? String(target.url ?? "")
              : ""
          : "",
    },
    onSubmit: createFormSubmitHandler(
      async (values: Record<string, unknown>) => {
        if (beforeSubmit?.() === false) return
        const common = z
          .object({
            triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
            maxDispatchesPerDay: z.coerce.number().int().positive(),
            cooldownMinutes: z.coerce.number().int().nonnegative(),
          })
          .parse(values)
        const guardrails = {
          maxDispatchesPerDay: common.maxDispatchesPerDay,
          cooldownMinutes: common.cooldownMinutes,
        }
        let target: StoredAgentDispatchTarget
        if (kind === "cursor") {
          const parsed = z
            .object({ repoUrl: z.string().url().or(z.literal("")), startingRef: z.string().optional() })
            .parse(values)
          target = {
            ...(parsed.repoUrl ? { repoUrl: parsed.repoUrl } : {}),
            ...(parsed.startingRef ? { startingRef: parsed.startingRef } : {}),
          }
        } else if (kind === "claude_code") {
          const parsed = z.object({ routineTriggerId: z.string().min(1) }).parse(values)
          target = { routineTriggerId: parsed.routineTriggerId }
        } else if (kind === "linear") {
          const parsed = z.object({ teamId: z.string().uuid(), assigneeId: z.string().optional() }).parse(values)
          target = { teamId: parsed.teamId, ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}) }
        } else {
          const parsed = z.object({ webhookUrl: z.string().url() }).parse(values)
          target = { webhookUrl: parsed.webhookUrl }
        }
        await onSubmit({ triggers: common.triggers, target, guardrails })
      },
      { resetOnSuccess: false },
    ),
  })

  return (
    <form
      className="flex w-full flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="triggers">
        {(field) => (
          <div className="flex max-w-3xl flex-col gap-3">
            <Label>Triggers</Label>
            {visibleTriggers.map((trigger) => {
              const meta = TRIGGER_LABELS[trigger]
              return (
                <div key={trigger} className="flex flex-row items-start gap-3">
                  <Checkbox
                    disabled={readOnly}
                    checked={field.state.value.includes(trigger)}
                    onCheckedChange={(checked) => {
                      field.handleChange(
                        checked === true
                          ? [...field.state.value, trigger]
                          : field.state.value.filter((value) => value !== trigger),
                      )
                    }}
                  />
                  <div className="flex flex-col gap-0.5">
                    <Text.H6 display="block">{meta.title}</Text.H6>
                    <Text.H6 display="block" color="foregroundMuted">
                      {meta.description}
                    </Text.H6>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </form.Field>

      {kind === "cursor" ? (
        <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <form.Field name="repoUrl">
            {(field) =>
              cursorRepositoryOptions.length > 0 ? (
                <Select
                  name="repoUrl"
                  label="Repository"
                  placeholder={cursorRepositoriesLoading ? "Loading repositories" : "Select a repository"}
                  searchable
                  loading={cursorRepositoriesLoading}
                  disabled={readOnly || cursorRepositoriesLoading}
                  options={cursorRepositoryOptions}
                  value={field.state.value}
                  onChange={(value) => field.handleChange(String(value))}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              ) : (
                <Input
                  label="Repository URL"
                  placeholder="https://github.com/acme/app"
                  disabled={readOnly || cursorRepositoriesLoading}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )
            }
          </form.Field>
          <form.Field name="startingRef">
            {(field) => (
              <Input
                label="Branch"
                placeholder="main"
                className="h-9"
                disabled={readOnly}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      ) : null}

      {kind === "claude_code" ? (
        <div className="max-w-md">
          <form.Field name="routineTriggerId">
            {(field) => (
              <Input
                label="Routine trigger ID"
                disabled={readOnly}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      ) : null}
      {kind === "linear" ? (
        <div className="flex max-w-md flex-col gap-3">
          <form.Field name="teamId">
            {(field) => (
              <Select
                name="teamId"
                label="Linear team"
                description="Latitude creates issues in this team."
                placeholder={linearTeamsLoading ? "Loading Linear teams" : "Select a Linear team"}
                searchable
                loading={linearTeamsLoading}
                disabled={readOnly || linearTeamsLoading}
                options={linearTeamOptions}
                value={field.state.value}
                onChange={(value) => field.handleChange(String(value))}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="assigneeId">
            {(field) => (
              <Select
                name="assigneeId"
                label="Assignee"
                description="Optional. Leave empty to create unassigned issues."
                placeholder={linearMembersLoading ? "Loading Linear users" : "Select a Linear user"}
                searchable
                removable
                loading={linearMembersLoading}
                disabled={readOnly || linearMembersLoading}
                options={linearMemberOptions}
                value={field.state.value}
                onChange={(value) => field.handleChange(String(value))}
              />
            )}
          </form.Field>
        </div>
      ) : null}
      {kind === "webhook" ? (
        <div className="flex max-w-3xl flex-col gap-4">
          {effectiveWebhookSecret ? (
            <div className="flex flex-col gap-2">
              <Text.H6>Webhook secret</Text.H6>
              <CopyableText
                value={effectiveWebhookSecret}
                displayValue={maskSensitiveValue(effectiveWebhookSecret)}
                tooltip="Copy webhook secret"
              />
            </div>
          ) : null}
          <form.Field name="webhookUrl">
            {(field) => (
              <Input
                label="Webhook URL"
                disabled={readOnly}
                value={String(field.state.value)}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      ) : null}

      {readOnly ? (
        extraActions ? (
          <div className="flex max-w-3xl flex-row gap-2">{extraActions}</div>
        ) : null
      ) : (
        <form.Subscribe selector={(state) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting })}>
          {({ isDirty, isSubmitting }) => (
            <div className="flex max-w-3xl flex-row gap-2">
              {isDirty ? (
                <Button type="submit" isLoading={isSubmitting}>
                  {submitLabel}
                </Button>
              ) : null}
              {extraActions}
            </div>
          )}
        </form.Subscribe>
      )}
    </form>
  )
}

export function ConnectAgentDispatchModal({
  kind,
  projectId,
  open,
  onClose,
  onWebhookSecret,
}: {
  readonly kind: AgentDispatchKindKey
  readonly projectId: string
  readonly open: boolean
  readonly onClose: () => void
  readonly onWebhookSecret: (secret: string) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null)
  const [cursorRepositories, setCursorRepositories] = useState<
    Awaited<ReturnType<typeof listCursorRepositoriesForApiKey>>
  >([])
  const [cursorApiKeyForRepositories, setCursorApiKeyForRepositories] = useState("")
  const [loadedCursorApiKeyForRepositories, setLoadedCursorApiKeyForRepositories] = useState("")
  const [cursorRepositoryError, setCursorRepositoryError] = useState<string | null>(null)
  const [linearTeams, setLinearTeams] = useState<Awaited<ReturnType<typeof listLinearTeamsForApiKey>>>([])
  const [linearApiKeyForTeams, setLinearApiKeyForTeams] = useState("")
  const [loadedLinearApiKeyForTeams, setLoadedLinearApiKeyForTeams] = useState("")
  const [linearTeamError, setLinearTeamError] = useState<string | null>(null)

  const form = useForm({
    defaultValues:
      kind === "cursor"
        ? { cursorApiKey: "", repoUrl: "", startingRef: "" }
        : kind === "claude_code"
          ? { claudeRoutineToken: "", routineUrl: "" }
          : kind === "linear"
            ? { linearApiKey: "", teamId: "" }
            : { webhookUrl: "" },
    onSubmit: createFormSubmitHandler(
      async (
        values:
          | { cursorApiKey: string; repoUrl: string; startingRef: string }
          | { claudeRoutineToken: string; routineUrl: string }
          | { linearApiKey: string; teamId: string }
          | { webhookUrl: string },
      ) => {
        if (kind === "cursor") {
          const parsed = z
            .object({
              cursorApiKey: z.string().min(1),
              repoUrl: z.string().url().or(z.literal("")),
              startingRef: z.string().optional(),
            })
            .parse(values)
          await connectCursorIntegration({
            data: {
              kind: "cursor",
              cursorApiKey: parsed.cursorApiKey,
              ...(parsed.repoUrl ? { repoUrl: parsed.repoUrl } : {}),
              ...(parsed.startingRef ? { startingRef: parsed.startingRef } : {}),
            },
          })
        } else if (kind === "claude_code") {
          const parsed = z
            .object({
              claudeRoutineToken: z.string().min(1),
              routineUrl: z
                .string()
                .url()
                .refine(
                  (value) => extractClaudeRoutineTriggerId(value) !== null,
                  "Paste the routine page URL from Claude Code.",
                ),
            })
            .parse(values)
          await connectClaudeIntegration({
            data: {
              kind: "claude_code",
              claudeRoutineToken: parsed.claudeRoutineToken,
              routineTriggerId: extractClaudeRoutineTriggerId(parsed.routineUrl)!,
            },
          })
        } else if (kind === "linear") {
          const parsed = z.object({ linearApiKey: z.string().min(1), teamId: z.string().uuid() }).parse(values)
          await connectLinearIntegration({
            data: { kind: "linear", linearApiKey: parsed.linearApiKey, teamId: parsed.teamId },
          })
        } else {
          const parsed = z.object({ webhookUrl: z.string().url() }).parse(values)
          const result = await connectWebhookIntegration({
            data: { kind: "webhook", webhookUrl: parsed.webhookUrl },
          })
          setWebhookSecret(result.webhookSecret)
          onWebhookSecret(result.webhookSecret)
          await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
          await queryClient.invalidateQueries({ queryKey: orgDefaultConfigQueryKey(kind) })
          await queryClient.invalidateQueries({ queryKey: projectDispatchSettingsQueryKey(projectId, kind) })
          await queryClient.invalidateQueries({ queryKey: sendToDestinationsQueryKey(projectId) })
          toast({ description: `${KIND_LABELS[kind]} connected` })
          return
        }
        await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
        await queryClient.invalidateQueries({ queryKey: orgDefaultConfigQueryKey(kind) })
        await queryClient.invalidateQueries({ queryKey: projectDispatchSettingsQueryKey(projectId, kind) })
        await queryClient.invalidateQueries({ queryKey: sendToDestinationsQueryKey(projectId) })
        toast({ description: `${KIND_LABELS[kind]} connected` })
        onClose()
      },
      { resetOnSuccess: true },
    ),
  })

  const cursorRepositoryOptions = cursorRepositories.map((repo) => ({
    label: `${repo.owner}/${repo.name}`,
    value: repo.repository,
  }))
  const linearTeamOptions = linearTeams.map((team) => ({
    label: `${team.name} (${team.key})`,
    value: team.id,
  }))
  const loadCursorRepositoriesMutation = useMutation({
    mutationFn: (cursorApiKey: string) => listCursorRepositoriesForApiKey({ data: { cursorApiKey } }),
    onSuccess: (repositories, cursorApiKey) => {
      setCursorRepositoryError(null)
      setCursorRepositories(repositories)
      setLoadedCursorApiKeyForRepositories(cursorApiKey)
    },
    onError: (error) => {
      setCursorRepositories([])
      setLoadedCursorApiKeyForRepositories("")
      setCursorRepositoryError(toUserMessage(error))
    },
  })

  const loadLinearTeamsMutation = useMutation({
    mutationFn: (linearApiKey: string) => listLinearTeamsForApiKey({ data: { linearApiKey } }),
    onSuccess: (teams, linearApiKey) => {
      setLinearTeamError(null)
      setLinearTeams(teams)
      setLoadedLinearApiKeyForTeams(linearApiKey)
    },
    onError: (error) => {
      setLinearTeams([])
      setLoadedLinearApiKeyForTeams("")
      setLinearTeamError(toUserMessage(error))
    },
  })

  const trimmedCursorApiKey = cursorApiKeyForRepositories.trim()
  const hasCursorApiKey = trimmedCursorApiKey.length > 0
  const showCursorRepositoryFields =
    kind === "cursor" &&
    hasCursorApiKey &&
    loadedCursorApiKeyForRepositories === trimmedCursorApiKey &&
    !loadCursorRepositoriesMutation.isPending &&
    !cursorRepositoryError
  const showCursorRepositorySkeleton =
    kind === "cursor" && hasCursorApiKey && !showCursorRepositoryFields && !cursorRepositoryError
  const trimmedLinearApiKey = linearApiKeyForTeams.trim()
  const hasLinearApiKey = trimmedLinearApiKey.length > 0
  const showLinearTeamFields =
    kind === "linear" &&
    hasLinearApiKey &&
    loadedLinearApiKeyForTeams === trimmedLinearApiKey &&
    !loadLinearTeamsMutation.isPending &&
    !linearTeamError
  const showLinearTeamSkeleton = kind === "linear" && hasLinearApiKey && !showLinearTeamFields && !linearTeamError

  useDebounce(
    () => {
      const cursorApiKey = cursorApiKeyForRepositories.trim()
      if (kind !== "cursor" || !cursorApiKey) {
        setCursorRepositories([])
        setLoadedCursorApiKeyForRepositories("")
        setCursorRepositoryError(null)
        return
      }
      loadCursorRepositoriesMutation.mutate(cursorApiKey)
    },
    500,
    [kind, cursorApiKeyForRepositories],
  )

  useDebounce(
    () => {
      const linearApiKey = linearApiKeyForTeams.trim()
      if (kind !== "linear" || !linearApiKey) {
        setLinearTeams([])
        setLoadedLinearApiKeyForTeams("")
        setLinearTeamError(null)
        return
      }
      loadLinearTeamsMutation.mutate(linearApiKey)
    },
    500,
    [kind, linearApiKeyForTeams],
  )

  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setWebhookSecret(null)
          onClose()
        }
      }}
      title={`Connect ${KIND_LABELS[kind]}`}
      dismissible
      footer={
        webhookSecret ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <Button onClick={() => void form.handleSubmit()} isLoading={form.state.isSubmitting}>
            Connect
          </Button>
        )
      }
    >
      {webhookSecret ? (
        <div className="flex flex-col gap-2">
          <Text.H6>Copy this webhook secret now. It will not be shown again.</Text.H6>
          <CopyableText value={webhookSecret} tooltip="Copy webhook secret" />
        </div>
      ) : kind === "cursor" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <Text.H5 display="block" weight="semibold">
              Get your Cursor API key
            </Text.H5>
            <div className="flex flex-col gap-2">
              <Text.H6 display="block" color="foregroundMuted">
                1. Open Cursor API keys in a new tab and sign in to the workspace you want Latitude to use.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                2. Create a new API key for Latitude, then copy it before leaving Cursor.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                3. Return here, paste the key, and click Connect. You can revoke the key later from Cursor settings.
              </Text.H6>
            </div>
            <div className="flex flex-row flex-wrap items-center gap-2 pt-1">
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <a href="https://cursor.com/dashboard/api" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Cursor
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <a
                  href="https://cursor.com/docs/cli/reference/authentication#api-key-authentication"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon icon={ExternalLink} size="sm" />
                  Cursor docs
                </a>
              </Button>
              <IntegrationDocsButton kind={kind} variant="ghost" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <form.Field name="cursorApiKey">
              {(field) => (
                <Input
                  label="Cursor API key"
                  type="password"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    setCursorRepositories([])
                    setLoadedCursorApiKeyForRepositories("")
                    setCursorRepositoryError(null)
                    setCursorApiKeyForRepositories(event.target.value)
                  }}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )}
            </form.Field>
          </div>
          {cursorRepositoryError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
              <Text.H6 color="destructive">{cursorRepositoryError}</Text.H6>
            </div>
          ) : null}
          {showCursorRepositorySkeleton ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ) : showCursorRepositoryFields ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <form.Field name="repoUrl">
                {(field) =>
                  cursorRepositoryOptions.length > 0 ? (
                    <Select
                      name="repoUrl"
                      label="Repository"
                      placeholder="Select a repository"
                      searchable
                      options={cursorRepositoryOptions}
                      value={field.state.value}
                      onChange={(value) => field.handleChange(String(value))}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    />
                  ) : (
                    <Input
                      label="Repository URL"
                      placeholder="https://github.com/acme/app"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    />
                  )
                }
              </form.Field>
              <form.Field name="startingRef">
                {(field) => (
                  <Input
                    label="Branch"
                    placeholder="main"
                    className="h-9"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                  />
                )}
              </form.Field>
            </div>
          ) : null}
        </div>
      ) : kind === "claude_code" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <Text.H5 display="block" weight="semibold">
              Connect a Claude Code routine
            </Text.H5>
            <div className="flex flex-col gap-2">
              <Text.H6 display="block" color="foregroundMuted">
                1. Open Claude Code and create or select the routine Latitude should trigger.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                2. Use the template below as the routine description.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                3. Copy the trigger token from the API section and the routine page URL from your browser.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                4. Paste both values here. Latitude will extract the routine ID from the page URL.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                Latitude's dispatch prompt asks the agent to brand its branch and PR with the signal reference (e.g.
                "Resolves LAT-XY9Z"), so merging the PR resolves the signal automatically when the GitHub integration is
                connected.
              </Text.H6>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={async () => {
                  await navigator.clipboard.writeText(CLAUDE_ROUTINE_TEMPLATE)
                  toast({ description: "Routine description copied" })
                }}
              >
                <Icon icon={Copy} size="sm" />
                Copy routine description
              </Button>
              <div className="flex flex-row flex-wrap items-center justify-center gap-2">
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer">
                    <Icon icon={ExternalLink} size="sm" />
                    Claude Code
                  </a>
                </Button>
                <Button asChild variant="ghost" size="sm" className="shrink-0">
                  <a href="https://code.claude.com/docs/en/routines" target="_blank" rel="noreferrer">
                    <Icon icon={ExternalLink} size="sm" />
                    Claude Code docs
                  </a>
                </Button>
                <IntegrationDocsButton kind={kind} variant="ghost" />
              </div>
            </div>
          </div>
          <form.Field name="claudeRoutineToken">
            {(field) => (
              <Input
                label="Routine token"
                type="password"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="routineUrl">
            {(field) => (
              <Input
                label="Routine URL"
                description="Copy this from your browser while viewing the routine."
                placeholder="https://claude.ai/code/routines/trig_..."
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      ) : kind === "linear" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <Text.H5 display="block" weight="semibold">
              Get your Linear API key
            </Text.H5>
            <div className="flex flex-col gap-2">
              <Text.H6 display="block" color="foregroundMuted">
                1. Open Linear API settings in the workspace where Latitude should create issues.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                2. Create a personal API key for Latitude and copy it before leaving Linear.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                3. Paste the key, then choose the Linear team where Latitude should create issues.
              </Text.H6>
            </div>
            <div className="flex flex-row flex-wrap items-center gap-2 pt-1">
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <a href="https://linear.app/settings/account/security" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Linear API settings
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <a href="https://linear.app/docs/graphql/working-with-the-graphql-api" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Linear API docs
                </a>
              </Button>
              <IntegrationDocsButton kind={kind} variant="ghost" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <form.Field name="linearApiKey">
              {(field) => (
                <Input
                  label="Linear API key"
                  type="password"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    setLinearTeams([])
                    setLoadedLinearApiKeyForTeams("")
                    setLinearTeamError(null)
                    setLinearApiKeyForTeams(event.target.value)
                  }}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )}
            </form.Field>
            {linearTeamError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                <Text.H6 color="destructive">{linearTeamError}</Text.H6>
              </div>
            ) : null}
            {showLinearTeamSkeleton ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-3 w-48" />
              </div>
            ) : showLinearTeamFields ? (
              <form.Field name="teamId">
                {(field) => (
                  <Select
                    name="teamId"
                    label="Linear team"
                    description="Latitude creates issues in this team."
                    placeholder="Select a Linear team"
                    searchable
                    options={linearTeamOptions}
                    value={field.state.value}
                    onChange={(value) => field.handleChange(String(value))}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                  />
                )}
              </form.Field>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <Text.H5 display="block" weight="semibold">
              Prepare your webhook endpoint
            </Text.H5>
            <div className="flex flex-col gap-2">
              <Text.H6 display="block" color="foregroundMuted">
                1. Create a public HTTPS endpoint that accepts POST requests.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                2. Latitude sends JSON with trigger, context, and prompt fields.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                3. Verify X-Latitude-Signature using the webhook secret shown after you connect.
              </Text.H6>
              <Text.H6 display="block" color="foregroundMuted">
                4. Return a 2xx response when your system accepts the dispatch.
              </Text.H6>
            </div>
            <div className="flex flex-row flex-wrap items-center gap-2 pt-1">
              <IntegrationDocsButton kind={kind} variant="outline" />
            </div>
          </div>
          <form.Field name="webhookUrl">
            {(field) => (
              <Input
                label="Webhook URL"
                placeholder="https://hooks.example.com/latitude/dispatch"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      )}
    </Modal>
  )
}

function AgentDispatchHistorySection({
  projectId,
  projectSlug,
  kind,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly kind: AgentDispatchKindKey
}) {
  const [errorDetailModal, setErrorDetailModal] = useState<{ title: string; detail: string } | null>(null)
  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["agent-dispatches", projectId],
    queryFn: () => listAgentDispatches({ data: { projectId } }),
  })

  if (isLoading) return null

  const filteredDispatches = dispatches.filter((dispatch: AgentDispatchRecord) => dispatch.kind === kind)

  const columns: InfiniteTableColumn<AgentDispatchRecord>[] = [
    {
      key: "trigger",
      header: "Trigger",
      width: 180,
      render: (dispatch) => DISPATCH_TRIGGER_TITLES[dispatch.trigger] ?? dispatch.trigger.replaceAll(".", " "),
    },
    {
      key: "source",
      header: "Source",
      width: 260,
      render: (dispatch) =>
        dispatch.sourceType === "signal" && dispatch.sourceSlug ? (
          <Link
            to="/projects/$projectSlug/signals/$signalSlug"
            params={{ projectSlug, signalSlug: dispatch.sourceSlug }}
            aria-label={`Open signal ${dispatch.sourceName ?? dispatch.sourceSlug}`}
            className="flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground hover:underline"
          >
            <span className="truncate">{dispatch.sourceName ?? dispatch.sourceSlug}</span>
            <Icon icon={ExternalLink} size="xs" />
          </Link>
        ) : dispatch.sourceType === "monitor" && dispatch.sourceSlug ? (
          <Link
            to="/projects/$projectSlug/monitors/$monitorSlug"
            params={{ projectSlug, monitorSlug: dispatch.sourceSlug }}
            aria-label={`Open monitor ${dispatch.sourceName ?? dispatch.sourceId}`}
            className="flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground hover:underline"
          >
            <span className="truncate">{dispatch.sourceName ?? "Deleted monitor"}</span>
            <Icon icon={ExternalLink} size="xs" />
          </Link>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <Badge variant="outlineMuted" size="small" className="w-fit">
              {dispatch.sourceType}
            </Badge>
            <Text.H6 className="truncate font-mono" color="foregroundMuted">
              {dispatch.sourceId}
            </Text.H6>
          </div>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: 240,
      render: (dispatch) => {
        const statusVariant =
          dispatch.status === "dispatched"
            ? "successMuted"
            : dispatch.status === "failed"
              ? "destructiveMuted"
              : "muted"
        const errorTitle = getDispatchErrorTitle(dispatch)
        const errorDetail = getDispatchErrorDetail(dispatch)

        return (
          <div className="flex min-w-0 items-end gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Badge variant={statusVariant} size="small" className="w-fit capitalize">
                {dispatch.status}
              </Badge>
              {errorTitle ? <Text.H7 color="destructive">{errorTitle}</Text.H7> : null}
            </div>
            {errorDetail ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="View error details"
                onClick={() => setErrorDetailModal({ title: errorTitle ?? "Error details", detail: errorDetail })}
              >
                <Icon icon={FileText} size="sm" />
              </Button>
            ) : null}
          </div>
        )
      },
    },
    {
      key: "claimedAt",
      header: "Claimed",
      width: 130,
      render: (dispatch) => relativeTime(new Date(dispatch.claimedAt)),
    },
    {
      key: "run",
      header: "Run",
      width: 150,
      align: "end",
      render: (dispatch) => {
        const linkLabel = dispatch.kind ? (DEEP_LINK_LABELS[dispatch.kind] ?? "View run") : "View run"
        const href = dispatch.externalUrl ?? dispatch.routineUrl
        const label = dispatch.externalUrl ? linkLabel : dispatch.routineUrl ? "Claude routine" : null

        return href && label ? (
          <Button asChild variant="ghost" size="sm">
            <a href={href} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              {label}
            </a>
          </Button>
        ) : (
          <Text.H6 color="foregroundMuted">—</Text.H6>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text.H5 display="block" weight="semibold">
          Dispatch history
        </Text.H5>
        <Text.H6 display="block" color="foregroundMuted">
          Audit log of dispatches triggered by signals, monitors, incidents, and manual sends.
        </Text.H6>
      </div>
      <InfiniteTable
        data={filteredDispatches}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(dispatch) => dispatch.id}
        blankSlate="No dispatches yet."
        scrollAreaLayout="intrinsic"
        className="max-h-[min(32rem,60vh)]"
      />
      {errorDetailModal ? (
        <DispatchErrorDetailModal
          title={errorDetailModal.title}
          detail={errorDetailModal.detail}
          onClose={() => setErrorDetailModal(null)}
        />
      ) : null}
    </div>
  )
}
