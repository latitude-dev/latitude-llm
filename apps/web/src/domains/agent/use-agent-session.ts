import { type AgentEvent, agentEventSchema } from "@domain/agent"
import { useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { abortAgentTurn, getAgentSession, respondToConfirmation, startAgentTurn } from "./agent.functions.ts"

interface AgentChatMessage {
  readonly id: string
  readonly role: "user" | "assistant" | "tool"
  readonly text: string
}

interface PendingConfirmation {
  readonly toolCallId: string
  readonly toolName: string
  readonly title: string
  readonly summary: string
  readonly input: unknown
}

interface AgentMessagePartLike {
  readonly type: string
  readonly text?: string
}

const partsText = (rawParts: string): string => {
  try {
    const parts = JSON.parse(rawParts) as AgentMessagePartLike[]
    return parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
  } catch {
    return ""
  }
}

interface AgentSessionController {
  readonly sessionId: string | null
  readonly messages: readonly AgentChatMessage[]
  readonly status: string | null
  readonly running: boolean
  readonly error: string | null
  readonly pendingConfirmation: PendingConfirmation | null
  readonly send: (prompt: string) => void
  readonly respond: (toolCallId: string, decision: "approve" | "deny") => void
  readonly abort: () => void
}

/**
 * Drives one command-palette agent chat: opens/continues a session, streams live events over SSE,
 * and exposes the transcript (durable, refetched on each turn end), transient status, and a pending
 * confirmation. `activeProjectSlug` is passed to the worker as context (the agent is org-wide).
 */
export function useAgentSession(options: {
  readonly initialSessionId: string | null
  readonly projectId?: string
  readonly activeProjectSlug?: string
  readonly onSessionCreated?: (sessionId: string) => void
}): AgentSessionController {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(options.initialSessionId)
  const [messages, setMessages] = useState<readonly AgentChatMessage[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)

  const onSessionCreated = options.onSessionCreated
  const optionsRef = useRef(options)
  optionsRef.current = options

  const refetchTranscript = useCallback(async (id: string) => {
    const transcript = await getAgentSession({ data: { sessionId: id } })
    setMessages(
      transcript.messages
        .map((message) => ({ id: message.id, role: message.role, text: partsText(message.parts) }))
        .filter((message) => message.role !== "tool" && message.text.length > 0),
    )
  }, [])

  // Hydrate the durable transcript whenever we attach to an existing session.
  useEffect(() => {
    if (!sessionId) return
    void refetchTranscript(sessionId)
  }, [sessionId, refetchTranscript])

  // One SSE connection per session, kept open across turns; torn down on unmount / session change.
  useEffect(() => {
    if (!sessionId) return
    const source = new EventSource(`/api/agent/${sessionId}/events`)
    source.onmessage = (event) => {
      let parsed: AgentEvent
      try {
        parsed = agentEventSchema.parse(JSON.parse(event.data))
      } catch {
        return
      }
      switch (parsed.type) {
        case "status":
          setStatus(parsed.text)
          break
        case "confirmation_request":
          setPendingConfirmation({
            toolCallId: parsed.toolCallId,
            toolName: parsed.toolName,
            title: parsed.title,
            summary: parsed.summary,
            input: parsed.input,
          })
          break
        case "confirmation_resolved":
          setPendingConfirmation((current) => (current?.toolCallId === parsed.toolCallId ? null : current))
          break
        case "navigate":
          void router.navigate({ to: parsed.to })
          break
        case "done":
          setRunning(false)
          setStatus(null)
          setPendingConfirmation(null)
          void refetchTranscript(sessionId)
          break
        case "error":
          setRunning(false)
          setStatus(null)
          setError(parsed.error)
          break
        default:
          break
      }
    }
    return () => source.close()
  }, [sessionId, router, refetchTranscript])

  const send = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim()
      if (trimmed.length === 0) return
      setError(null)
      setRunning(true)
      setStatus("Thinking")
      setMessages((current) => [...current, { id: `local-${current.length}`, role: "user", text: trimmed }])
      void startAgentTurn({
        data: {
          ...(sessionId ? { sessionId } : {}),
          ...(optionsRef.current.projectId ? { projectId: optionsRef.current.projectId } : {}),
          ...(optionsRef.current.activeProjectSlug ? { activeProjectSlug: optionsRef.current.activeProjectSlug } : {}),
          prompt: trimmed,
        },
      })
        .then((result) => {
          if (result.sessionId !== sessionId) {
            setSessionId(result.sessionId)
            onSessionCreated?.(result.sessionId)
          }
        })
        .catch((cause: unknown) => {
          setRunning(false)
          setStatus(null)
          setError(cause instanceof Error ? cause.message : "Something went wrong starting the agent.")
        })
    },
    [sessionId, onSessionCreated],
  )

  const respond = useCallback(
    (toolCallId: string, decision: "approve" | "deny") => {
      if (!sessionId) return
      setPendingConfirmation((current) => (current?.toolCallId === toolCallId ? null : current))
      void respondToConfirmation({ data: { sessionId, toolCallId, decision } })
    },
    [sessionId],
  )

  const abort = useCallback(() => {
    if (!sessionId) return
    setRunning(false)
    setStatus(null)
    void abortAgentTurn({ data: { sessionId } })
  }, [sessionId])

  return { sessionId, messages, status, running, error, pendingConfirmation, send, respond, abort }
}
