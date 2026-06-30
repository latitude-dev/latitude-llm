import { AGENT_DISPATCH_TRIGGERS } from "@domain/agent-dispatch"
import {
  Button,
  Checkbox,
  ClaudeCodeIcon,
  CopyableText,
  Icon,
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
import { Copy, ExternalLink, type LucideProps, Plus, Webhook } from "lucide-react"
import { useState } from "react"
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
  getAgentDispatchConfig,
  getWebhookSecret,
  isAgentDispatchEnabled,
  listAgentDispatches,
  listAgentDispatchIntegrations,
  listCursorRepositories,
  listCursorRepositoriesForApiKey,
  listLinearMembers,
  upsertAgentDispatchConfig,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
import { useDebounce } from "../../../../../../lib/hooks/useDebounce.ts"
import { maskSensitiveValue } from "../../../../../../lib/mask-sensitive-value.ts"
import { IntegrationCard } from "./integration-card.tsx"

export const AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY = ["agent-dispatch-integrations"] as const

const KIND_LABELS = {
  cursor: "Cursor",
  claude_code: "Claude Code",
  linear: "Linear",
  webhook: "Webhook",
} as const

type AgentDispatchKindKey = keyof typeof KIND_LABELS

const DEEP_LINK_LABELS: Record<AgentDispatchKindKey, string> = {
  cursor: "View in Cursor",
  claude_code: "View in Claude",
  linear: "View Linear issue",
  webhook: "View delivery",
}

const INTEGRATION_SUBTITLES: Record<AgentDispatchKindKey, string> = {
  cursor: "Cursor agents react to Latitude signals and push fixes to your code.",
  claude_code: "Claude Code routines react to Latitude signals and push fixes to your code.",
  linear: "Create Linear issues for signals that need follow-up.",
  webhook: "Send integration events to your own endpoint.",
}

const ACTIVE_DISPATCH_TRIGGERS = ["signal.discovered", "incident.opened"] as const

const TRIGGER_LABELS: Record<(typeof ACTIVE_DISPATCH_TRIGGERS)[number], { title: string; description: string }> = {
  "signal.discovered": {
    title: "New signal",
    description: "Dispatch when Latitude discovers a new signal.",
  },
  "incident.opened": {
    title: "Escalating signal",
    description: "Dispatch when a signal escalates into an incident.",
  },
}

function isActiveDispatchTrigger(trigger: string): trigger is (typeof ACTIVE_DISPATCH_TRIGGERS)[number] {
  return ACTIVE_DISPATCH_TRIGGERS.some((activeTrigger) => activeTrigger === trigger)
}

function CursorIcon(props: LucideProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
      <path
        d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
        fill="currentColor"
      />
    </svg>
  )
}

function LinearIcon(props: LucideProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M5.8 14.6L14.6 5.8" stroke="white" strokeLinecap="round" strokeWidth="2" />
      <path d="M8.8 17.2L17.2 8.8" stroke="white" strokeLinecap="round" strokeWidth="2" />
      <path d="M5.6 10.8L10.8 5.6" stroke="white" strokeLinecap="round" strokeWidth="2" />
      <path d="M13.2 18.4L18.4 13.2" stroke="white" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

const INTEGRATION_ICONS = {
  cursor: CursorIcon,
  claude_code: ClaudeCodeIcon,
  linear: LinearIcon,
  webhook: Webhook,
} as const

const CLAUDE_ROUTINE_TEMPLATE =
  "Inspect the Latitude signal, identify the regression or newly discovered issue, implement the fix, run the relevant checks, and report what changed."

function extractClaudeRoutineTriggerId(routineUrl: string) {
  return routineUrl.trim().match(/\/routines\/(trig_[^/?#]+)/)?.[1] ?? null
}

export function AgentDispatchSection({ projectId }: { readonly projectId: string }) {
  const { data: enabled } = useQuery({
    queryKey: ["agent-dispatch-enabled"],
    queryFn: () => isAgentDispatchEnabled(),
  })
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
    queryFn: () => listAgentDispatchIntegrations(),
    enabled: enabled?.enabled === true,
  })

  if (!enabled?.enabled) return null
  if (isLoading) return null

  return (
    <>
      {(Object.keys(KIND_LABELS) as AgentDispatchKindKey[]).map((kind) => (
        <AgentDispatchKindCard
          key={kind}
          kind={kind}
          integration={integrations.find((row: AgentDispatchIntegrationRecord) => row.kind === kind) ?? null}
          projectId={projectId}
        />
      ))}
      <AgentDispatchHistorySection projectId={projectId} />
    </>
  )
}

function AgentDispatchKindCard({
  kind,
  integration,
  projectId,
}: {
  readonly kind: AgentDispatchKindKey
  readonly integration: AgentDispatchIntegrationRecord | null
  readonly projectId: string
}) {
  const [connectOpen, setConnectOpen] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectAgentDispatchIntegration({ data: { integrationId: integration!.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: ["agent-dispatch-config", projectId, kind] })
      toast({ description: `${KIND_LABELS[kind]} disconnected` })
    },
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  if (!integration) {
    return (
      <>
        <IntegrationCard
          icon={INTEGRATION_ICONS[kind]}
          title={KIND_LABELS[kind]}
          subtitle={INTEGRATION_SUBTITLES[kind]}
          actions={
            <Button variant="outline" onClick={() => setConnectOpen(true)}>
              <Icon icon={Plus} size="sm" />
              Connect
            </Button>
          }
        />
        <ConnectAgentDispatchModal
          kind={kind}
          projectId={projectId}
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onWebhookSecret={setWebhookSecret}
        />
      </>
    )
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 flex-row items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon icon={INTEGRATION_ICONS[kind]} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H5 weight="semibold">{KIND_LABELS[kind]}</Text.H5>
            <Text.H6 color="foregroundMuted">Connected {relativeTime(new Date(integration.installedAt))}</Text.H6>
          </div>
        </div>
        <Button variant="outline" onClick={() => disconnectMutation.mutate()} isLoading={disconnectMutation.isPending}>
          Disconnect
        </Button>
      </div>
      <AgentDispatchConfigForm
        projectId={projectId}
        kind={kind}
        integrationId={integration.id}
        vendorAccountId={integration.vendorAccountId}
        webhookSecret={kind === "webhook" ? webhookSecret : null}
      />
    </div>
  )
}

function AgentDispatchConfigForm({
  projectId,
  kind,
  integrationId,
  vendorAccountId,
  webhookSecret,
}: {
  readonly projectId: string
  readonly kind: AgentDispatchKindKey
  readonly integrationId: string
  readonly vendorAccountId: string
  readonly webhookSecret: string | null
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: config, isLoading } = useQuery({
    queryKey: ["agent-dispatch-config", projectId, kind],
    queryFn: () => getAgentDispatchConfig({ data: { projectId, kind } }),
  })

  if (isLoading) return null

  return (
    <AgentDispatchConfigFormInner
      key={config ? `${config.id}:${config.updatedAt}` : "new"}
      projectId={projectId}
      kind={kind}
      integrationId={integrationId}
      vendorAccountId={vendorAccountId}
      initial={config ?? null}
      webhookSecret={webhookSecret}
      onSaved={async () => {
        await queryClient.invalidateQueries({ queryKey: ["agent-dispatch-config", projectId, kind] })
        toast({ description: "Dispatch settings saved" })
      }}
    />
  )
}

function AgentDispatchConfigFormInner({
  projectId,
  kind,
  integrationId,
  vendorAccountId,
  initial,
  webhookSecret,
  onSaved,
}: {
  readonly projectId: string
  readonly kind: AgentDispatchKindKey
  readonly integrationId: string
  readonly vendorAccountId: string
  readonly initial: AgentDispatchConfigRecord | null
  readonly webhookSecret: string | null
  readonly onSaved: () => Promise<void>
}) {
  const target = initial?.target
  const visibleTriggers = ACTIVE_DISPATCH_TRIGGERS.filter(
    (trigger) => kind !== "linear" || trigger === "signal.discovered",
  )
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
  const { data: storedWebhookSecret } = useQuery({
    queryKey: ["webhook-secret", integrationId],
    queryFn: () => getWebhookSecret({ data: { integrationId } }),
    enabled: kind === "webhook",
  })
  const linearMemberOptions = linearMembers.map((member) => ({
    label: member.email ? `${member.name} (${member.email})` : member.name,
    value: member.id,
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
        if (kind === "cursor") {
          const parsed = z
            .object({
              enabled: z.boolean(),
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
              maxDispatchesPerDay: z.coerce.number().int().positive(),
              cooldownMinutes: z.coerce.number().int().nonnegative(),
              repoUrl: z.string().url(),
              startingRef: z.string().optional(),
            })
            .parse(values)
          await upsertAgentDispatchConfig({
            data: {
              projectId,
              integrationId,
              kind,
              enabled: parsed.triggers.length > 0,
              triggers: parsed.triggers,
              target: {
                repoUrl: parsed.repoUrl,
                ...(parsed.startingRef ? { startingRef: parsed.startingRef } : {}),
              },
              guardrails: {
                maxDispatchesPerDay: parsed.maxDispatchesPerDay,
                cooldownMinutes: parsed.cooldownMinutes,
              },
            },
          })
        } else if (kind === "claude_code") {
          const parsed = z
            .object({
              enabled: z.boolean(),
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
              maxDispatchesPerDay: z.coerce.number().int().positive(),
              cooldownMinutes: z.coerce.number().int().nonnegative(),
              routineTriggerId: z.string().min(1),
            })
            .parse(values)
          await upsertAgentDispatchConfig({
            data: {
              projectId,
              integrationId,
              kind,
              enabled: parsed.triggers.length > 0,
              triggers: parsed.triggers,
              target: { routineTriggerId: parsed.routineTriggerId },
              guardrails: {
                maxDispatchesPerDay: parsed.maxDispatchesPerDay,
                cooldownMinutes: parsed.cooldownMinutes,
              },
            },
          })
        } else if (kind === "linear") {
          const parsed = z
            .object({
              enabled: z.boolean(),
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
              maxDispatchesPerDay: z.coerce.number().int().positive(),
              cooldownMinutes: z.coerce.number().int().nonnegative(),
              teamId: z.string().min(1),
              assigneeId: z.string().optional(),
            })
            .parse(values)
          await upsertAgentDispatchConfig({
            data: {
              projectId,
              integrationId,
              kind,
              enabled: parsed.triggers.length > 0,
              triggers: parsed.triggers,
              target: {
                teamId: parsed.teamId,
                ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}),
              },
              guardrails: {
                maxDispatchesPerDay: parsed.maxDispatchesPerDay,
                cooldownMinutes: parsed.cooldownMinutes,
              },
            },
          })
        } else {
          const parsed = z
            .object({
              enabled: z.boolean(),
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
              maxDispatchesPerDay: z.coerce.number().int().positive(),
              cooldownMinutes: z.coerce.number().int().nonnegative(),
              webhookUrl: z.string().url(),
            })
            .parse(values)
          await upsertAgentDispatchConfig({
            data: {
              projectId,
              integrationId,
              kind,
              enabled: parsed.triggers.length > 0,
              triggers: parsed.triggers,
              target: { webhookUrl: parsed.webhookUrl },
              guardrails: {
                maxDispatchesPerDay: parsed.maxDispatchesPerDay,
                cooldownMinutes: parsed.cooldownMinutes,
              },
            },
          })
        }
        await onSaved()
      },
      { resetOnSuccess: false },
    ),
  })

  return (
    <form
      className="flex w-full flex-col gap-6 border-t border-border p-6"
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
                  disabled={cursorRepositoriesLoading}
                  options={cursorRepositoryOptions}
                  value={field.state.value}
                  onChange={(value) => field.handleChange(String(value))}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              ) : (
                <Input
                  label="Repository URL"
                  placeholder="https://github.com/acme/app"
                  disabled={cursorRepositoriesLoading}
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

      {kind === "claude_code" ? (
        <div className="max-w-md">
          <form.Field name="routineTriggerId">
            {(field) => (
              <Input
                label="Routine trigger ID"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      ) : null}
      {kind === "linear" ? (
        <div className="max-w-md">
          <form.Field name="assigneeId">
            {(field) => (
              <Select
                name="assigneeId"
                label="Assignee (optional)"
                description="Optional. Leave empty to create unassigned issues."
                placeholder={linearMembersLoading ? "Loading Linear users" : "Select a Linear user"}
                searchable
                removable
                loading={linearMembersLoading}
                disabled={linearMembersLoading}
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
                value={String(field.state.value)}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      ) : null}

      <form.Subscribe selector={(state) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting })}>
        {({ isDirty, isSubmitting }) =>
          isDirty ? (
            <div className="max-w-3xl">
              <Button type="submit" isLoading={isSubmitting}>
                Save settings
              </Button>
            </div>
          ) : null
        }
      </form.Subscribe>
    </form>
  )
}

function ConnectAgentDispatchModal({
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
            .object({ cursorApiKey: z.string().min(1), repoUrl: z.string().url(), startingRef: z.string().optional() })
            .parse(values)
          await connectCursorIntegration({
            data: {
              kind: "cursor",
              cursorApiKey: parsed.cursorApiKey,
              projectId,
              repoUrl: parsed.repoUrl,
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
          const parsed = z.object({ linearApiKey: z.string().min(1), teamId: z.string().min(1) }).parse(values)
          await connectLinearIntegration({
            data: { kind: "linear", linearApiKey: parsed.linearApiKey, teamId: parsed.teamId },
          })
        } else {
          const parsed = z.object({ webhookUrl: z.string().url() }).parse(values)
          const result = await connectWebhookIntegration({
            data: { kind: "webhook", webhookUrl: parsed.webhookUrl, projectId },
          })
          setWebhookSecret(result.webhookSecret)
          onWebhookSecret(result.webhookSecret)
          await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
          await queryClient.invalidateQueries({ queryKey: ["agent-dispatch-config", projectId, kind] })
          toast({ description: `${KIND_LABELS[kind]} connected` })
          return
        }
        await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
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
            <div className="flex flex-row flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <a href="https://cursor.com/dashboard/api" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Cursor
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href="https://cursor.com/docs/cli/reference/authentication#api-key-authentication"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon icon={ExternalLink} size="sm" />
                  Cursor docs
                </a>
              </Button>
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
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(CLAUDE_ROUTINE_TEMPLATE)
                  toast({ description: "Routine description copied" })
                }}
              >
                <Icon icon={Copy} size="sm" />
                Copy routine description
              </Button>
            </div>
            <div className="flex flex-row flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Claude Code
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="https://code.claude.com/docs/en/routines" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Claude Code docs
                </a>
              </Button>
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
                3. Paste the key and the Linear team ID where Latitude should create issues.
              </Text.H6>
            </div>
            <div className="flex flex-row flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <a href="https://linear.app/latitude/settings/account/security" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Open Linear API settings
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="https://linear.app/docs/graphql/working-with-the-graphql-api" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Linear API docs
                </a>
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <form.Field name="linearApiKey">
              {(field) => (
                <Input
                  label="Linear API key"
                  type="password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )}
            </form.Field>
            <form.Field name="teamId">
              {(field) => (
                <Input
                  label="Linear team ID"
                  description="Latitude creates issues in this team."
                  placeholder="LAT"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )}
            </form.Field>
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
            <div className="flex flex-row flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <a href="https://docs.latitude.so/more/agent-dispatch-webhooks" target="_blank" rel="noreferrer">
                  <Icon icon={ExternalLink} size="sm" />
                  Webhook docs
                </a>
              </Button>
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

function AgentDispatchHistorySection({ projectId }: { readonly projectId: string }) {
  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["agent-dispatches", projectId],
    queryFn: () => listAgentDispatches({ data: { projectId } }),
  })

  if (isLoading) return null

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-col gap-1 border-b border-border p-4">
        <Text.H5 display="block" weight="semibold">
          Dispatch history
        </Text.H5>
        <Text.H6 display="block" color="foregroundMuted">
          Audit log of dispatches triggered by signals and incidents.
        </Text.H6>
      </div>
      {dispatches.length === 0 ? (
        <div className="p-4">
          <Text.H6 color="foregroundMuted">No dispatches yet.</Text.H6>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {dispatches.map((dispatch: AgentDispatchRecord) => (
            <AgentDispatchRow key={dispatch.id} dispatch={dispatch} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentDispatchRow({ dispatch }: { readonly dispatch: AgentDispatchRecord }) {
  const linkLabel = dispatch.kind ? (DEEP_LINK_LABELS[dispatch.kind] ?? "View run") : "View run"

  return (
    <div className="flex flex-row flex-wrap items-center justify-between gap-2 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text.H6 weight="semibold">
          {dispatch.trigger} · {dispatch.sourceType}:{dispatch.sourceId}
        </Text.H6>
        <Text.H6 color="foregroundMuted">
          {dispatch.status} · {relativeTime(new Date(dispatch.claimedAt))}
          {dispatch.errorCategory ? ` · ${dispatch.errorCategory}` : ""}
        </Text.H6>
      </div>
      {dispatch.externalUrl ? (
        <Button asChild variant="outline" size="sm">
          <a href={dispatch.externalUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            {linkLabel}
          </a>
        </Button>
      ) : null}
    </div>
  )
}
