import { useCallback, useEffect, useRef, useState } from "react"

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          "expired-callback"?: () => void
          "error-callback"?: () => void
          theme?: "light" | "dark" | "auto"
          size?: "normal" | "compact" | "flexible"
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

let scriptLoaded = false
let scriptLoading = false
const scriptLoadCallbacks: Array<() => void> = []

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  return new Promise((resolve) => {
    scriptLoadCallbacks.push(resolve)
    if (scriptLoading) return
    scriptLoading = true

    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.onload = () => {
      scriptLoaded = true
      for (const cb of scriptLoadCallbacks) cb()
      scriptLoadCallbacks.length = 0
    }
    document.head.appendChild(script)
  })
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export function Turnstile({ siteKey, onVerify, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  const onErrorRef = useRef(onError)
  const [ready, setReady] = useState(scriptLoaded)

  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire
  onErrorRef.current = onError

  useEffect(() => {
    if (!ready) {
      loadTurnstileScript().then(() => setReady(true))
    }
  }, [ready])

  const renderWidget = useCallback(() => {
    if (!ready || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current !== null) {
      window.turnstile.remove(widgetIdRef.current)
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onVerifyRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      "error-callback": () => onErrorRef.current?.(),
      theme: "auto",
      size: "flexible",
    })
  }, [ready, siteKey])

  useEffect(() => {
    renderWidget()
    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [renderWidget])

  return <div ref={containerRef} />
}
