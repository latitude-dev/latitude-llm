import {
  Button,
  CloseTrigger,
  CopyButton,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Modal,
  Skeleton,
  Text,
  ToastAction,
  useToast,
} from "@repo/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Clipboard, Loader2, Plus, Sparkles } from "lucide-react"
import { useState } from "react"
import {
  getSignalDispatchPrompt,
  isAgentDispatchEnabled,
  listSendToDestinations,
  type SendToDestinationRecord,
  sendSignalToIntegration,
  sendToDestinationsQueryKey,
} from "../../../../../../../domains/agent-dispatch/agent-dispatch.functions.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"
import {
  AGENT_DISPATCH_KIND_ICONS,
  AGENT_DISPATCH_KIND_LABELS,
} from "../../../settings/-components/agent-dispatch-section.tsx"

const MCP_DOCS_URL = "https://docs.latitude.so/getting-started/mcp"

const failureDescription = (label: string, reason: string): string =>
  reason === "auth" || reason === "config" ? `${label} rejected the dispatch.` : `Could not reach ${label}. Try again.`

function dispatchHistoryLink(projectSlug: string, kind: SendToDestinationRecord["kind"]) {
  return (
    <Link
      to="/projects/$projectSlug/settings/integrations/$integrationKind"
      params={{ projectSlug, integrationKind: kind }}
      className="font-medium underline"
    >
      View dispatch history
    </Link>
  )
}

function dispatchToastDescription(message: string, projectSlug: string, kind: SendToDestinationRecord["kind"]) {
  return (
    <span>
      {message} {dispatchHistoryLink(projectSlug, kind)}
    </span>
  )
}

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
  const [promptModalOpen, setPromptModalOpen] = useState(false)

  const { data: dispatchEnabled } = useQuery({
    queryKey: ["agent-dispatch-enabled"],
    queryFn: () => isAgentDispatchEnabled(),
  })
  const { data: destinations, isLoading: destinationsLoading } = useQuery({
    queryKey: sendToDestinationsQueryKey(projectId),
    queryFn: () => listSendToDestinations({ data: { projectId } }),
    enabled: dispatchEnabled?.enabled === true,
  })

  const sendMutation = useMutation({
    mutationFn: (destination: SendToDestinationRecord) =>
      sendSignalToIntegration({
        data: { projectId, signalId, configId: destination.configId, sendId: crypto.randomUUID() },
      }),
    onSuccess: (result, destination) => {
      const label = AGENT_DISPATCH_KIND_LABELS[destination.kind]
      if (result.status === "dispatched") {
        toast({
          description: dispatchToastDescription(`Sent to ${label}.`, projectSlug, destination.kind),
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
        toast({
          description: dispatchToastDescription(`Already sent to ${label}.`, projectSlug, destination.kind),
        })
      } else {
        toast({
          variant: "destructive",
          description: dispatchToastDescription(
            failureDescription(label, result.reason),
            projectSlug,
            destination.kind,
          ),
        })
      }
    },
    onError: (error, destination) =>
      toast({
        variant: "destructive",
        description: dispatchToastDescription(toUserMessage(error), projectSlug, destination.kind),
      }),
  })

  const sendingConfigId = sendMutation.isPending ? sendMutation.variables?.configId : undefined

  const hasCloudDestinations = (destinations?.length ?? 0) > 0
  const showCloudSection = dispatchEnabled?.enabled === true

  return (
    <>
      <DropdownMenuRoot modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="text-sm" disabled={disabled || sendMutation.isPending}>
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Icon icon={Sparkles} size="sm" />
            )}
            {sendMutation.isPending ? "Sending…" : "Send to agent"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent align="end" className="w-56">
            {showCloudSection ? (
              <>
                <DropdownMenuLabel className="font-medium text-muted-foreground">Cloud agents</DropdownMenuLabel>
                {destinationsLoading ? (
                  <DropdownMenuItem disabled className="items-center gap-2">
                    <Text.H5 color="foregroundMuted">Loading integrations…</Text.H5>
                  </DropdownMenuItem>
                ) : hasCloudDestinations ? (
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
                      {sendingConfigId === destination.configId ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" aria-hidden />
                      ) : (
                        <Icon icon={AGENT_DISPATCH_KIND_ICONS[destination.kind]} size="sm" />
                      )}
                      <Text.H5>
                        {sendingConfigId === destination.configId
                          ? "Sending…"
                          : AGENT_DISPATCH_KIND_LABELS[destination.kind]}
                      </Text.H5>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem asChild className="cursor-pointer items-center gap-2">
                    <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                      <Icon icon={Plus} size="sm" />
                      <Text.H5>Set up cloud agents</Text.H5>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuLabel className="font-medium text-muted-foreground">Local agents</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={() => setPromptModalOpen(true)}>
              <Icon icon={Clipboard} size="sm" />
              <Text.H5>Copy prompt</Text.H5>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      {promptModalOpen ? (
        <CopyPromptModal projectId={projectId} signalId={signalId} onClose={() => setPromptModalOpen(false)} />
      ) : null}
    </>
  )
}

function CopyPromptModal({
  projectId,
  signalId,
  onClose,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["signal-dispatch-prompt", projectId, signalId],
    queryFn: () => getSignalDispatchPrompt({ data: { projectId, signalId } }),
  })

  const prompt = data?.prompt

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title="Copy prompt"
      description="Paste this into Cursor, Claude Code, Codex, OpenCode, or any coding agent in the repository that produced these traces."
      footer={<CloseTrigger />}
    >
      <div className="flex flex-col gap-4">
        {isError || (!isLoading && !prompt) ? (
          <Text.H6 color="destructive">Could not load the prompt. Close this dialog and try again.</Text.H6>
        ) : isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="group relative">
            <div className="absolute top-0 right-0 z-10 rounded-tr-md rounded-bl-lg bg-muted p-0.5">
              <CopyButton value={prompt ?? ""} tooltip="Copy" />
            </div>
            <pre className="max-h-80 overflow-y-auto rounded-md bg-muted p-3 pr-12 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
              {prompt}
            </pre>
          </div>
        )}
        <Text.H6 display="block" color="foregroundMuted">
          Works best with the{" "}
          <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            Latitude MCP server
          </a>{" "}
          connected, but the prompt carries trace IDs and excerpts as starting evidence either way.
        </Text.H6>
      </div>
    </Modal>
  )
}
