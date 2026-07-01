import { useAgentChat } from "agents/chat/react"
import { useAgent } from "agents/react"
import { useState, type FormEvent } from "react"
import { createRoot } from "react-dom/client"

function textParts(message: { parts?: Array<{ type?: string; text?: string }> }) {
  return (message.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = input.trim()
    if (!message) return
    setInput("")
    sendMessage({ text: message })
  }

  return (
    <main>
      <h1>Cloudflare Code Mode + Latitude</h1>
      <p className='sub'>The agent exposes one codemode tool that runs generated code in a sandbox.</p>

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
          const text = textParts(message)
          if (!text) return null
          return (
            <div key={message.id} className={`msg ${message.role === "user" ? "user" : "assistant"}`}>
              {text}
            </div>
          )
        })}
        {connectionError ? <div className='status error'>Error: {connectionError.message}</div> : null}
        {status !== "ready" ? <div className='status'>{status}</div> : null}
      </div>

      <form onSubmit={onSubmit}>
        <div>
          <input
            id='input'
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder='Ask about the weather in a city...'
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
