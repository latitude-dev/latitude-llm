import { AgentShaderPanel, Button, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon } from "lucide-react"
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

/** A single keycap hint (⏎, ⌫, ↓) shown inside action buttons and expand affordances. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-current/25 px-1 font-sans text-[0.7em] leading-tight opacity-70">
      {children}
    </kbd>
  )
}

interface PendingConfirmationLike {
  readonly toolCallId: string
  readonly access: string
  readonly title: string
  readonly summary: string
  readonly input: unknown
}

/** The approve/reject gate: takes over the body when the agent wants to run a write/destructive tool. */
function ConfirmationView({
  confirmation,
  expanded,
  onToggleExpanded,
  onRespond,
}: {
  readonly confirmation: PendingConfirmationLike
  readonly expanded: boolean
  readonly onToggleExpanded: () => void
  readonly onRespond: (decision: "approve" | "deny") => void
}) {
  const payload = JSON.stringify(confirmation.input)
  const hasPayload = payload !== undefined && payload !== "{}" && payload !== "null"
  const destructive = confirmation.access === "destructive"

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto p-4">
      <Text.H6 color="foregroundMuted">The agent wants to run:</Text.H6>

      <div className="w-full max-w-md rounded-lg border border-border bg-muted/30 p-3">
        <Text.H5M>{confirmation.title}</Text.H5M>
        {confirmation.summary ? (
          <div className="mt-1">
            <Text.H6 color="foregroundMuted">{confirmation.summary}</Text.H6>
          </div>
        ) : null}
        {hasPayload ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={onToggleExpanded}
              className="flex w-full items-center gap-1 text-left text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? (
                <ChevronUpIcon className="size-3.5 shrink-0" />
              ) : (
                <ChevronDownIcon className="size-3.5 shrink-0" />
              )}
              {expanded ? null : <span className="min-w-0 flex-1 truncate font-mono text-xs">{payload}</span>}
              <Kbd>{expanded ? "↑" : "↓"}</Kbd>
            </button>
            {expanded ? (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                {JSON.stringify(confirmation.input, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" onClick={() => onRespond("deny")}>
          Reject
          <Kbd>⌫</Kbd>
        </Button>
        <Button variant={destructive ? "destructive" : "default"} onClick={() => onRespond("approve")}>
          {destructive ? "Run anyway" : "Accept"}
          <Kbd>⏎</Kbd>
        </Button>
      </div>
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
 * once done. Mutations pause for an approve/reject confirmation that takes over the body.
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
  const [payloadExpanded, setPayloadExpanded] = useState(false)
  const sentInitial = useRef(false)

  const pending = chat.pendingConfirmation
  const pendingToolCallId = pending?.toolCallId ?? null

  // Collapse the payload whenever a new confirmation arrives.
  useEffect(() => {
    setPayloadExpanded(false)
  }, [pendingToolCallId])

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

  // While a confirmation is pending the input keeps focus (readOnly), so the gate's keybinds are
  // handled here: Enter approves, Backspace rejects, ↓/Tab expands the payload, ↑ collapses it.
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (pending) {
      if (event.key === "Enter") {
        event.preventDefault()
        event.stopPropagation()
        chat.respond(pending.toolCallId, "approve")
      } else if (event.key === "Backspace") {
        event.preventDefault()
        event.stopPropagation()
        chat.respond(pending.toolCallId, "deny")
      } else if (event.key === "ArrowDown" || event.key === "Tab") {
        event.preventDefault()
        event.stopPropagation()
        setPayloadExpanded(true)
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        event.stopPropagation()
        setPayloadExpanded(false)
      }
      return
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      runQuery(input)
    }
  }

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
          onKeyDown={handleInputKeyDown}
        />
      </div>

      <div className="relative min-h-0 flex-1">
        {pending ? (
          <ConfirmationView
            confirmation={pending}
            expanded={payloadExpanded}
            onToggleExpanded={() => setPayloadExpanded((value) => !value)}
            onRespond={(decision) => chat.respond(pending.toolCallId, decision)}
          />
        ) : chat.running ? (
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
      </div>
    </div>
  )
}
