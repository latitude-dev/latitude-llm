import { AgentShaderPanel, Button, Text } from "@repo/ui"
import { ChevronLeftIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { useAgentSession } from "../../domains/agent/use-agent-session.ts"

/** Reveals its content from a heavy blur + transparent to sharp + opaque — the thinking→answer settle. */
function Reveal({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div
      className={`transition-[opacity,filter] duration-700 ease-out ${shown ? "opacity-100 blur-[0px]" : "opacity-0 blur-[16px]"}`}
    >
      {children}
    </div>
  )
}

interface AgentSessionViewProps {
  readonly initialSessionId: string | null
  readonly initialPrompt: string | null
  readonly projectId?: string
  readonly activeProjectSlug?: string
  readonly onSessionCreated: (sessionId: string) => void
  readonly onBack: () => void
}

/**
 * The command-palette "Ask" surface. Not a chat transcript: the top row is the prompt input (the
 * submitted question while a turn runs, then the last question as placeholder for a follow-up), and
 * the body shows the agent's live thinking (shader + status) while running and just the latest reply
 * once done. Mutations pause for an approve/reject confirmation.
 */
export function AgentSessionView({
  initialSessionId,
  initialPrompt,
  projectId,
  activeProjectSlug,
  onSessionCreated,
  onBack,
}: AgentSessionViewProps) {
  const chat = useAgentSession({
    initialSessionId,
    ...(projectId ? { projectId } : {}),
    ...(activeProjectSlug ? { activeProjectSlug } : {}),
    onSessionCreated,
  })
  const [input, setInput] = useState("")
  const [lastQuery, setLastQuery] = useState<string | null>(null)
  const sentInitial = useRef(false)

  const runQuery = (text: string) => {
    const value = text.trim()
    if (value.length === 0 || chat.running) return
    setLastQuery(value)
    setInput("")
    chat.send(value)
  }

  useEffect(() => {
    if (sentInitial.current) return
    if (initialPrompt && !initialSessionId) {
      sentInitial.current = true
      setLastQuery(initialPrompt)
      chat.send(initialPrompt)
    }
  }, [initialPrompt, initialSessionId, chat.send])

  return (
    <div className="flex h-[min(460px,70vh)] flex-col">
      <div className="flex h-12 items-center gap-2 border-border border-b px-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <input
          // biome-ignore lint/a11y/noAutofocus: the palette is a focus-trapped dialog opened on demand.
          autoFocus
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          // readOnly (not disabled) so the input keeps focus while a turn runs — disabling a focused
          // input drops focus onto the dialog shell and breaks the palette's keyboard handling.
          readOnly={chat.running}
          value={chat.running ? (lastQuery ?? "") : input}
          placeholder={chat.running ? "" : (lastQuery ?? "Ask anything…")}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              runQuery(input)
            }
          }}
        />
      </div>

      <div className="relative min-h-0 flex-1">
        {chat.running ? (
          // Full-bleed: the loading shader fills the body edge-to-edge (padding is only for text).
          <AgentShaderPanel loading status={chat.status ?? "Working…"} className="h-full" />
        ) : (
          <div className="h-full overflow-y-auto p-3">
            {chat.error ? (
              <Text.H5 color="destructive">{chat.error}</Text.H5>
            ) : chat.response ? (
              <Reveal key={chat.response}>
                <Text.H5 whiteSpace="preWrap">{chat.response}</Text.H5>
              </Reveal>
            ) : (
              <Text.H6 color="foregroundMuted">Ask the agent to find, explain, or change something.</Text.H6>
            )}
          </div>
        )}

        {chat.pendingConfirmation ? (
          <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-lg">
            <Text.H6M>The agent wants to run “{chat.pendingConfirmation.title}”</Text.H6M>
            {chat.pendingConfirmation.summary ? (
              <Text.H6 color="foregroundMuted">{chat.pendingConfirmation.summary}</Text.H6>
            ) : null}
            <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(chat.pendingConfirmation.input, null, 2)}
            </pre>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => chat.respond(chat.pendingConfirmation!.toolCallId, "deny")}>
                Reject
              </Button>
              <Button onClick={() => chat.respond(chat.pendingConfirmation!.toolCallId, "approve")}>
                Approve & run
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
