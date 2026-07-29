import { Button, Icon, Skeleton, Text, useToast } from "@repo/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  type AgentDispatchIntegrationRecord,
  getProjectDispatchSettings,
  listAgentDispatchIntegrations,
  resetProjectDispatchOverride,
  sendToDestinationsQueryKey,
  upsertProjectDispatchOverride,
} from "../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
  type AgentDispatchKindKey,
} from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import {
  AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
  AgentDispatchConfigFormInner,
  projectDispatchSettingsQueryKey,
} from "./agent-dispatch-section.tsx"

export function ProjectDispatchOverrides({ projectId }: { readonly projectId: string }) {
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: AGENT_DISPATCH_INTEGRATIONS_QUERY_KEY,
    queryFn: () => listAgentDispatchIntegrations(),
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (integrations.length === 0) return null

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Text.H5 display="block" weight="semibold">
          Cloud agents
        </Text.H5>
        <Text.H6 display="block" color="foregroundMuted">
          Override the organization dispatch defaults for this project.
        </Text.H6>
      </div>
      {integrations.map((integration: AgentDispatchIntegrationRecord) => (
        <ProjectDispatchKindSection
          key={integration.kind}
          projectId={projectId}
          kind={integration.kind}
          integration={integration}
        />
      ))}
    </div>
  )
}

function ProjectDispatchKindSection({
  projectId,
  kind,
  integration,
}: {
  readonly projectId: string
  readonly kind: AgentDispatchKindKey
  readonly integration: AgentDispatchIntegrationRecord
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const { data: settings, isLoading } = useQuery({
    queryKey: projectDispatchSettingsQueryKey(projectId, kind),
    queryFn: () => getProjectDispatchSettings({ data: { projectId, kind } }),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetProjectDispatchOverride({ data: { projectId, integrationId: integration.id } }),
    onSuccess: async () => {
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: projectDispatchSettingsQueryKey(projectId, kind) })
      await queryClient.invalidateQueries({ queryKey: sendToDestinationsQueryKey(projectId) })
      toast({ description: `${AGENT_DISPATCH_KIND_LABELS[kind]} reset to organization defaults` })
    },
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />

  const hasOverride = settings?.override != null
  const initial = settings?.effective ?? null
  const showForm = hasOverride || editing

  return (
    <section id={kind} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2">
          <Icon icon={AGENT_DISPATCH_KIND_ICONS[kind]} size="sm" />
          <Text.H5 weight="semibold">{AGENT_DISPATCH_KIND_LABELS[kind]}</Text.H5>
        </div>
        <Text.H6 color="foregroundMuted">
          {hasOverride ? "Customized for this project" : "Using organization defaults"}
        </Text.H6>
      </div>
      <AgentDispatchConfigFormInner
        key={`${kind}:${hasOverride ? "override" : "default"}:${settings?.effective?.updatedAt ?? "new"}`}
        kind={kind}
        integrationId={integration.id}
        vendorAccountId={integration.vendorAccountId}
        initial={initial}
        webhookSecret={null}
        readOnly={!showForm}
        submitLabel={hasOverride ? "Save override" : "Save for this project"}
        extraActions={
          showForm ? (
            hasOverride ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => resetMutation.mutate()}
                isLoading={resetMutation.isPending}
              >
                Reset to organization defaults
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Override for this project
            </Button>
          )
        }
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
          setEditing(false)
          await queryClient.invalidateQueries({ queryKey: projectDispatchSettingsQueryKey(projectId, kind) })
          await queryClient.invalidateQueries({ queryKey: sendToDestinationsQueryKey(projectId) })
          toast({ description: `${AGENT_DISPATCH_KIND_LABELS[kind]} settings saved for this project` })
        }}
      />
    </section>
  )
}
