import type { AgentDispatchKind } from "@domain/agent-dispatch"
import {
  Button,
  ClaudeCodeIcon,
  CloseTrigger,
  CodeBlock,
  CursorIcon,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Modal,
  OpenaiIcon,
  OpencodeIcon,
  Skeleton,
  Text,
  ToastAction,
  useToast,
} from "@repo/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type { LucideProps } from "lucide-react"
import { Plus, SendIcon } from "lucide-react"
import type { ComponentType } from "react"
import { useState } from "react"
import {
  getSignalDispatchPrompt,
  isAgentDispatchEnabled,
  listSendToDestinations,
  type SendToDestinationRecord,
  sendSignalToIntegration,
} from "../../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"
import { AGENT_DISPATCH_KIND_ICONS } from "../../../settings/-components/agent-dispatch-section.tsx"

const MCP_DOCS_URL = "https://docs.latitude.so/getting-started/mcp"

interface LocalHarness {
  readonly id: string
  readonly label: string
  readonly icon: ComponentType<LucideProps>
  readonly cliCommand: string
}

const LOCAL_HARNESSES: readonly LocalHarness[] = [
  { id: "cursor", label: "Cursor", icon: CursorIcon, cliCommand: "cursor-agent" },
  { id: "claude-code", label: "Claude Code", icon: ClaudeCodeIcon, cliCommand: "claude" },
  { id: "codex", label: "Codex", icon: OpenaiIcon, cliCommand: "codex" },
  { id: "opencode", label: "OpenCode", icon: OpencodeIcon, cliCommand: "opencode" },
]

const CLOUD_KIND_LABELS: Record<AgentDispatchKind, string> = {
  cursor: "Cursor Cloud",
  claude_code: "Claude Code Cloud",
  linear: "Linear",
  webhook: "Webhook",
}

const failureDescription = (label: string, reason: string): string =>
  reason === "auth" || reason === "config"
    ? `${label} rejected the dispatch. Check the integration in Settings → Integrations.`
    : `Could not reach ${label}. Try again.`

export function SignalSendTo({
  projectId,
  projectSlug,
  signalId,
  disabled = false,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly signalId: string
  readonly disabled?: boolean
}) {
  const { toast } = useToast()
  const [activeHarness, setActiveHarness] = useState<LocalHarness | null>(null)

  const { data: dispatchEnabled } = useQuery({
    queryKey: ["agent-dispatch-enabled"],
    queryFn: () => isAgentDispatchEnabled(),
  })
  const { data: destinations, isLoading: destinationsLoading } = useQuery({
    queryKey: ["send-to-destinations", projectId],
    queryFn: () => listSendToDestinations({ data: { projectId } }),
    enabled: dispatchEnabled?.enabled === true,
  })

  const sendMutation = useMutation({
    mutationFn: (destination: SendToDestinationRecord) =>
      sendSignalToIntegration({
        data: { projectId, signalId, configId: destination.configId, sendId: crypto.randomUUID() },
      }),
    onSuccess: (result, destination) => {
      const label = CLOUD_KIND_LABELS[destination.kind]
      if (result.status === "dispatched") {
        toast({
          description: `Sent to ${label}`,
          ...(result.externalUrl
            ? {
                action: (
                  <ToastAction altText={`View in ${label}`} asChild>
                    <a href={result.externalUrl} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </ToastAction>
                ),
              }
            : {}),
        })
      } else if (result.status === "skipped-already-dispatched") {
        toast({ description: `Already sent to ${label}` })
      } else {
        toast({ variant: "destructive", description: failureDescription(label, result.reason) })
      }
    },
    onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
  })

  return (
    <>
      <DropdownMenuRoot modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="text-sm" disabled={disabled}>
            <Icon icon={SendIcon} size="sm" />
            Send to
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Open in your agent</DropdownMenuLabel>
            {LOCAL_HARNESSES.map((harness) => (
              <DropdownMenuItem
                key={harness.id}
                className="cursor-pointer items-center gap-2"
                onSelect={() => setActiveHarness(harness)}
              >
                <Icon icon={harness.icon} size="sm" />
                <Text.H5>{harness.label}</Text.H5>
              </DropdownMenuItem>
            ))}
            {dispatchEnabled?.enabled ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Send to integration</DropdownMenuLabel>
                {destinationsLoading ? (
                  <DropdownMenuItem disabled className="items-center gap-2">
                    <Text.H5 color="foregroundMuted">Loading integrations…</Text.H5>
                  </DropdownMenuItem>
                ) : (destinations?.length ?? 0) === 0 ? (
                  <DropdownMenuItem asChild className="cursor-pointer items-center gap-2">
                    <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                      <Icon icon={Plus} size="sm" />
                      <Text.H5>Connect an integration…</Text.H5>
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  destinations?.map((destination) => (
                    <DropdownMenuItem
                      key={destination.configId}
                      disabled={sendMutation.isPending}
                      className="cursor-pointer items-center gap-2"
                      onSelect={() => {
                        if (sendMutation.isPending) return
                        sendMutation.mutate(destination)
                      }}
                    >
                      <Icon icon={AGENT_DISPATCH_KIND_ICONS[destination.kind]} size="sm" />
                      <Text.H5>{CLOUD_KIND_LABELS[destination.kind]}</Text.H5>
                    </DropdownMenuItem>
                  ))
                )}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      {activeHarness ? (
        <SendToHarnessModal
          projectId={projectId}
          signalId={signalId}
          harness={activeHarness}
          onClose={() => setActiveHarness(null)}
        />
      ) : null}
    </>
  )
}

function SendToHarnessModal({
  projectId,
  signalId,
  harness,
  onClose,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly harness: LocalHarness
  readonly onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["signal-dispatch-prompt", projectId, signalId],
    queryFn: () => getSignalDispatchPrompt({ data: { projectId, signalId } }),
  })

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title={`Send to ${harness.label}`}
      description={`Copy this prompt into ${harness.label} in the repository that produced these traces.`}
      footer={<CloseTrigger />}
    >
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : isError || !data ? (
          <Text.H6 color="destructive">Could not load the prompt. Close this dialog and try again.</Text.H6>
        ) : (
          <CodeBlock value={data.prompt} expandable={false} className="max-h-80" />
        )}
        <div className="flex flex-col gap-1">
          <Text.H6 display="block" color="foregroundMuted">
            Or run <span className="font-mono text-foreground">{harness.cliCommand}</span> in your repository and paste
            the prompt.
          </Text.H6>
          <Text.H6 display="block" color="foregroundMuted">
            Works best with the{" "}
            <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              Latitude MCP server
            </a>{" "}
            connected, but the prompt carries trace IDs and excerpts as starting evidence either way.
          </Text.H6>
        </div>
      </div>
    </Modal>
  )
}
