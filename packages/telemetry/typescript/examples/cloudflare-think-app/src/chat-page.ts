export const CHAT_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cloudflare Think + Latitude — QA</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font: 15px/1.5 system-ui, sans-serif; margin: 0; display: flex; justify-content: center; }
    main { width: 100%; max-width: 680px; padding: 24px 16px 96px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { margin: 0 0 16px; opacity: 0.65; font-size: 13px; }
    .meta { display: flex; gap: 8px; margin-bottom: 16px; }
    .meta label { flex: 1; font-size: 12px; opacity: 0.7; }
    .meta input { width: 100%; padding: 6px 8px; margin-top: 2px; border: 1px solid #8884; border-radius: 6px; background: transparent; color: inherit; }
    #log { display: flex; flex-direction: column; gap: 10px; }
    .msg { padding: 10px 12px; border-radius: 10px; white-space: pre-wrap; word-break: break-word; }
    .user { background: #3b82f6; color: #fff; align-self: flex-end; max-width: 85%; }
    .assistant { background: #8881; align-self: flex-start; max-width: 85%; }
    .status { font-size: 12px; opacity: 0.6; align-self: flex-start; }
    .error { color: #ef4444; }
    form { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px; padding: 12px 16px; background: Canvas; border-top: 1px solid #8883; justify-content: center; }
    form > div { display: flex; gap: 8px; width: 100%; max-width: 680px; }
    #input { flex: 1; padding: 10px 12px; border: 1px solid #8884; border-radius: 8px; background: transparent; color: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 8px; background: #3b82f6; color: #fff; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <main>
    <h1>Cloudflare Think + Latitude</h1>
    <p class="sub">Each message runs one agent turn. Find the trace in Latitude by the session id below.</p>
    <div class="meta">
      <label>user id<input id="userId" value="qa-user" /></label>
      <label>session id<input id="sessionId" readonly /></label>
    </div>
    <div id="log"></div>
  </main>
  <form id="form">
    <div>
      <input id="input" placeholder="Ask about the weather in a city…" autocomplete="off" />
      <button id="send" type="submit">Send</button>
    </div>
  </form>
  <script>
    const log = document.getElementById("log")
    const form = document.getElementById("form")
    const input = document.getElementById("input")
    const send = document.getElementById("send")
    const userIdEl = document.getElementById("userId")
    const sessionEl = document.getElementById("sessionId")
    sessionEl.value = "qa-" + crypto.randomUUID().slice(0, 8)

    function add(cls, text) {
      const el = document.createElement("div")
      el.className = "msg " + cls
      el.textContent = text
      log.appendChild(el)
      el.scrollIntoView({ block: "end" })
      return el
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      const message = input.value.trim()
      if (!message) return
      input.value = ""
      send.disabled = true
      add("user", message)
      const status = add("status", "thinking…")
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, sessionId: sessionEl.value, userId: userIdEl.value }),
        })
        const data = await res.json()
        status.remove()
        if (!res.ok || data.error) add("status error", "Error: " + (data.error || res.status))
        else add("assistant", data.text || "(no text returned)")
      } catch (err) {
        status.remove()
        add("status error", "Error: " + (err && err.message ? err.message : String(err)))
      } finally {
        send.disabled = false
        input.focus()
      }
    })
  </script>
</body>
</html>`
