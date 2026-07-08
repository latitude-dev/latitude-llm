import { AgentTextarea, Button, Text } from "@repo/ui"
import { useEffect, useRef, useState } from "react"
import { useAgentSession } from "../../domains/agent/use-agent-session.ts"

interface AgentSessionViewProps {
  readonly initialSessionId: string | null
  readonly initialPrompt: string | null
  readonly projectId?: string
  readonly activeProjectSlug?: string
  readonly onSessionCreated: (sessionId: string) => void
}

/**
 * The command-palette "Ask" surface: a fixed-height chat over the in-product agent. Streams live
 * status into the follow-up textarea's shader, renders the durable transcript, and prompts the user
 * to approve or reject any action the agent wants to take before it runs.
 */
export function AgentSessionView({
  initialSessionId,
  initialPrompt,
  projectId,
  activeProjectSlug,
  onSessionCreated,
}: AgentSessionViewProps) {
  const chat = useAgentSession({
    initialSessionId,
    ...(projectId ? { projectId } : {}),
    ...(activeProjectSlug ? { activeProjectSlug } : {}),
    onSessionCreated,
  })
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitial = useRef(false)

  useEffect(() => {
    if (sentInitial.current) return
    if (initialPrompt && !initialSessionId) {
      sentInitial.current = true
      chat.send(initialPrompt)
    }
  }, [initialPrompt, initialSessionId, chat.send])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [chat.messages, chat.status])

  const submit = () => {
    const value = input.trim()
    if (value.length === 0 || chat.running) return
    chat.send(value)
    setInput("")
  }

  return (
    <div className="flex h-[min(460px,70vh)] flex-col">
      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {chat.messages.length === 0 && !chat.running ? (
          <Text.H6 color="foregroundMuted">Ask the agent to find, explain, or change something.</Text.H6>
        ) : null}
        {chat.messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "self-end text-right" : "self-start"}>
            <div
              className={
                message.role === "user"
                  ? "rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                  : "rounded-lg bg-muted px-3 py-2"
              }
            >
              <Text.H5 whiteSpace="preWrap">{message.text}</Text.H5>
            </div>
          </div>
        ))}
        {chat.error ? <Text.H6 color="destructive">{chat.error}</Text.H6> : null}
      </div>

      {chat.pendingConfirmation ? (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-sm">
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
            <Button onClick={() => chat.respond(chat.pendingConfirmation!.toolCallId, "approve")}>Approve & run</Button>
          </div>
        </div>
      ) : null}

      <div className="border-border border-t p-3">
        <AgentTextarea
          value={input}
          status={chat.running ? (chat.status ?? "Working…") : null}
          minRows={1}
          maxRows={5}
          placeholder="Ask a follow-up…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
      </div>
    </div>
  )
}
