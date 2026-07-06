import { useAgentChat } from "@cloudflare/ai-chat/react"
import { useAgent } from "agents/react"
import { useState, type FormEvent } from "react"
import { createRoot } from "react-dom/client"
import { shouldRunCodemodeOrchestration } from "./codemode-code"

function messageContent(message: {
  role?: string
  parts?: Array<{ type?: string; text?: string; toolName?: string; output?: unknown }>
}) {
  const text = (message.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
  if (text) return text

  const codemodeResult = (message.parts ?? []).find(
    (part) => part.type === "tool-result" && part.toolName === "codemode",
  )
  if (codemodeResult?.output != null) {
    return typeof codemodeResult.output === "string"
      ? codemodeResult.output
      : JSON.stringify(codemodeResult.output, null, 2)
  }

  const codemodeCall = (message.parts ?? []).find(
    (part) => part.type === "tool-call" && part.toolName === "codemode",
  )
  if (codemodeCall) return "Running codemode plan…"

  return null
}

function Chat() {
  const [input, setInput] = useState("")
  const [userId, setUserId] = useState("qa-user")
  const [sessionId] = useState(() => `qa-${crypto.randomUUID().slice(0, 8)}`)
  const agent = useAgent({ agent: "MyAgent", name: sessionId })
  const { messages, sendMessage, status, connectionError } = useAgentChat({
    agent,
    getInitialMessages: null,
    body: () => ({ userId, sessionId }),
  })

  const lastUserText = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.parts?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = input.trim()
    if (!message) return
    setInput("")
    sendMessage({ text: message })
  }

  const statusLabel =
    status === "submitted" && shouldRunCodemodeOrchestration(lastUserText ?? "")
      ? "planning trip (codemode running on server)…"
      : status

  return (
    <main>
      <h1>Cloudflare Code Mode + Latitude</h1>
      <p className='sub'>
        Casual chat works normally. Ask about travel weather (e.g. compare Barcelona vs Paris) to trigger codemode
        orchestration with lookupCity, getWeather, delegateWeatherResearch, and formatTravelBrief.
      </p>

      <div className='meta'>
        <label>
          user id
          <input value={userId} onChange={(event) => setUserId(event.currentTarget.value)} />
        </label>
        <label>
          session id
          <input value={sessionId} readOnly />
        </label>
      </div>

      <div id='log'>
        {messages.map((message) => {
          const text = messageContent(message)
          if (!text) return null
          return (
            <div key={message.id} className={`msg ${message.role === "user" ? "user" : "assistant"}`}>
              {text}
            </div>
          )
        })}
        {connectionError ? <div className='status error'>Error: {connectionError.message}</div> : null}
        {status !== "ready" ? <div className='status'>{statusLabel}</div> : null}
      </div>

      <form onSubmit={onSubmit}>
        <div>
          <input
            id='input'
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder='Try "hello" or "compare Barcelona vs Paris weather"'
            autoComplete='off'
          />
          <button type='submit' disabled={status !== "ready"}>
            Send
          </button>
        </div>
      </form>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Chat />)
