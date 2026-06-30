import { AGENT_DISPATCH_TRIGGERS } from "@domain/agent-dispatch"
import { Alert, Button, Checkbox, Input, Label, Modal, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, ExternalLink, Webhook } from "lucide-react"
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
  isAgentDispatchEnabled,
  listAgentDispatches,
  listAgentDispatchIntegrations,
  upsertAgentDispatchConfig,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
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

const MCP_REMINDER =
  "Ensure the Latitude MCP is connected on your Cursor environment or Claude routine before enabling dispatch."

const LINEAR_TRIAGE_REMINDER =
  "Set a Linear triage rule (Delegate → your coding agent) so issues created by Latitude auto-start an agent."

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
    <div className="flex flex-col gap-4">
      <div>
        <Text.H5 weight="semibold">Agent dispatch</Text.H5>
        <Text.H6 color="foregroundMuted">
          Wake a coding agent when signals escalate or new patterns are discovered.
        </Text.H6>
      </div>
      <Alert showIcon title="MCP prerequisite" description={MCP_REMINDER} />
      <div className="flex flex-col gap-3">
        {(Object.keys(KIND_LABELS) as AgentDispatchKindKey[]).map((kind) => (
          <AgentDispatchKindCard
            key={kind}
            kind={kind}
            integration={integrations.find((row: AgentDispatchIntegrationRecord) => row.kind === kind) ?? null}
            projectId={projectId}
          />
        ))}
      </div>
      <AgentDispatchHistorySection projectId={projectId} />
    </div>
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
          icon={kind === "webhook" ? Webhook : Bot}
          title={KIND_LABELS[kind]}
          subtitle={kind === "linear" ? "Broker via Linear issue creation" : "Start a hosted coding agent run"}
          actions={<Button onClick={() => setConnectOpen(true)}>Connect {KIND_LABELS[kind]}</Button>}
        />
        <ConnectAgentDispatchModal kind={kind} open={connectOpen} onClose={() => setConnectOpen(false)} />
      </>
    )
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text.H5 weight="semibold">{KIND_LABELS[kind]}</Text.H5>
          <Text.H6 color="foregroundMuted">Connected {relativeTime(new Date(integration.installedAt))}</Text.H6>
        </div>
        <Button variant="outline" onClick={() => disconnectMutation.mutate()} isLoading={disconnectMutation.isPending}>
          Disconnect
        </Button>
      </div>
      {kind === "linear" ? (
        <div className="border-t border-border p-4">
          <Text.H6 color="foregroundMuted">{LINEAR_TRIAGE_REMINDER}</Text.H6>
        </div>
      ) : null}
      <AgentDispatchConfigForm projectId={projectId} kind={kind} integrationId={integration.id} />
    </div>
  )
}

function AgentDispatchConfigForm({
  projectId,
  kind,
  integrationId,
}: {
  readonly projectId: string
  readonly kind: AgentDispatchKindKey
  readonly integrationId: string
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
      key={config?.id ?? "new"}
      projectId={projectId}
      kind={kind}
      integrationId={integrationId}
      initial={config ?? null}
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
  initial,
  onSaved,
}: {
  readonly projectId: string
  readonly kind: AgentDispatchKindKey
  readonly integrationId: string
  readonly initial: AgentDispatchConfigRecord | null
  readonly onSaved: () => Promise<void>
}) {
  const target = initial?.target
  const form = useForm({
    defaultValues: {
      enabled: initial?.enabled ?? false,
      triggers: [...(initial?.triggers ?? ["incident.opened"])],
      maxDispatchesPerDay: initial?.guardrails.maxDispatchesPerDay ?? 10,
      cooldownMinutes: initial?.guardrails.cooldownMinutes ?? 60,
      repoUrl: kind === "cursor" && target && "repoUrl" in target ? target.repoUrl : "",
      startingRef: kind === "cursor" && target && "startingRef" in target ? target.startingRef : "main",
      environmentName: kind === "cursor" && target && "environmentName" in target ? (target.environmentName ?? "") : "",
      routineTriggerId: kind === "claude_code" && target && "routineTriggerId" in target ? target.routineTriggerId : "",
      teamId: kind === "linear" && target && "teamId" in target ? target.teamId : "",
      assigneeId: kind === "linear" && target && "assigneeId" in target ? (target.assigneeId ?? "") : "",
      webhookUrl: kind === "webhook" && target && "webhookUrl" in target ? target.webhookUrl : "",
    },
    onSubmit: createFormSubmitHandler(
      async (values: Record<string, unknown>) => {
        if (kind === "cursor") {
          const parsed = z
            .object({
              enabled: z.boolean(),
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).min(1),
              maxDispatchesPerDay: z.coerce.number().int().positive(),
              cooldownMinutes: z.coerce.number().int().nonnegative(),
              repoUrl: z.string().url(),
              startingRef: z.string().min(1),
              environmentName: z.string().optional(),
            })
            .parse(values)
          await upsertAgentDispatchConfig({
            data: {
              projectId,
              integrationId,
              kind,
              enabled: parsed.enabled,
              triggers: parsed.triggers,
              target: {
                repoUrl: parsed.repoUrl,
                startingRef: parsed.startingRef,
                ...(parsed.environmentName ? { environmentName: parsed.environmentName } : {}),
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
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).min(1),
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
              enabled: parsed.enabled,
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
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).min(1),
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
              enabled: parsed.enabled,
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
              triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).min(1),
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
              enabled: parsed.enabled,
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
      className="flex flex-col gap-4 border-t border-border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <Text.H5 weight="semibold">Project dispatch</Text.H5>
      <div className="flex flex-row items-center gap-2">
        <Checkbox
          checked={form.state.values.enabled}
          onCheckedChange={(checked) => form.setFieldValue("enabled", checked === true)}
        />
        <Label>Enable agent dispatch for this project</Label>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Triggers</Label>
        {AGENT_DISPATCH_TRIGGERS.map((trigger) => (
          <div key={trigger} className="flex flex-row items-center gap-2">
            <Checkbox
              checked={form.state.values.triggers.includes(trigger)}
              onCheckedChange={(checked) => {
                const current = form.state.values.triggers
                form.setFieldValue(
                  "triggers",
                  checked === true ? [...current, trigger] : current.filter((value) => value !== trigger),
                )
              }}
            />
            <Text.H6>{trigger}</Text.H6>
          </div>
        ))}
      </div>
      {kind === "cursor" ? (
        <>
          <form.Field name="repoUrl">
            {(field) => (
              <Input
                label="Repository URL"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="startingRef">
            {(field) => (
              <Input
                label="Starting ref"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="environmentName">
            {(field) => (
              <Input
                label="Cursor environment name (optional)"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
        </>
      ) : null}
      {kind === "claude_code" ? (
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
      ) : null}
      {kind === "linear" ? (
        <>
          <form.Field name="teamId">
            {(field) => (
              <Input
                label="Linear team ID"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="assigneeId">
            {(field) => (
              <Input
                label="Assignee ID (optional)"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
        </>
      ) : null}
      {kind === "webhook" ? (
        <form.Field name="webhookUrl">
          {(field) => (
            <Input
              label="Webhook URL"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <form.Field name="maxDispatchesPerDay">
          {(field) => (
            <Input
              label="Max dispatches per day"
              type="number"
              value={String(field.state.value)}
              onChange={(event) => field.handleChange(Number(event.target.value))}
            />
          )}
        </form.Field>
        <form.Field name="cooldownMinutes">
          {(field) => (
            <Input
              label="Cooldown minutes"
              type="number"
              value={String(field.state.value)}
              onChange={(event) => field.handleChange(Number(event.target.value))}
            />
          )}
        </form.Field>
      </div>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div>
            <Button type="submit" isLoading={isSubmitting}>
              Save dispatch settings
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}

function ConnectAgentDispatchModal({
  kind,
  open,
  onClose,
}: {
  readonly kind: AgentDispatchKindKey
  readonly open: boolean
  readonly onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null)

  const form = useForm({
    defaultValues:
      kind === "cursor"
        ? { cursorApiKey: "" }
        : kind === "claude_code"
          ? { claudeRoutineToken: "", routineTriggerId: "" }
          : kind === "linear"
            ? { linearApiKey: "" }
            : { webhookUrl: "" },
    onSubmit: createFormSubmitHandler(
      async (
        values:
          | { cursorApiKey: string }
          | { claudeRoutineToken: string; routineTriggerId: string }
          | { linearApiKey: string }
          | { webhookUrl: string },
      ) => {
        if (kind === "cursor") {
          const parsed = z.object({ cursorApiKey: z.string().min(1) }).parse(values)
          await connectCursorIntegration({
            data: {
              kind: "cursor",
              cursorApiKey: parsed.cursorApiKey,
            },
          })
        } else if (kind === "claude_code") {
          const parsed = z
            .object({ claudeRoutineToken: z.string().min(1), routineTriggerId: z.string().min(1) })
            .parse(values)
          await connectClaudeIntegration({ data: { kind: "claude_code", ...parsed } })
        } else if (kind === "linear") {
          const parsed = z.object({ linearApiKey: z.string().min(1) }).parse(values)
          await connectLinearIntegration({ data: { kind: "linear", linearApiKey: parsed.linearApiKey } })
        } else {
          const parsed = z.object({ webhookUrl: z.string().url() }).parse(values)
          const result = await connectWebhookIntegration({ data: { kind: "webhook", webhookUrl: parsed.webhookUrl } })
          setWebhookSecret(result.webhookSecret)
          return
        }
        await queryClient.invalidateQueries({ queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY })
        toast({ description: `${KIND_LABELS[kind]} connected` })
        onClose()
      },
      { resetOnSuccess: true },
    ),
  })

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
          <Text.H6>Copy this webhook secret now — it will not be shown again.</Text.H6>
          <Input label="Webhook secret" value={webhookSecret} readOnly />
        </div>
      ) : kind === "cursor" ? (
        <form.Field name="cursorApiKey">
          {(field) => (
            <Input
              label="Cursor API key"
              type="password"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
      ) : kind === "claude_code" ? (
        <div className="flex flex-col gap-3">
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
          <Text.H6 color="foregroundMuted">{MCP_REMINDER}</Text.H6>
        </div>
      ) : kind === "linear" ? (
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
          <Text.H6 color="foregroundMuted">{LINEAR_TRIAGE_REMINDER}</Text.H6>
        </div>
      ) : (
        <form.Field name="webhookUrl">
          {(field) => (
            <Input
              label="Webhook URL"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
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
      <div className="border-b border-border p-4">
        <Text.H5 weight="semibold">Agent dispatch history</Text.H5>
        <Text.H6 color="foregroundMuted">
          Audit log of coding-agent dispatches triggered by signals and incidents.
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
