import type { PersonalityKind } from "@domain/spans"
import { useCallback, useEffect, useState } from "react"

interface ShareSectionProps {
  readonly personalityKind: PersonalityKind
  readonly archetypeTitle: string
}

/**
 * Share-your-week call-to-action. Sits below the personality reveal as the
 * page's closing moment.
 *
 * Uses the Web Share API when available (mobile + most modern desktops)
 * and falls back to the clipboard. Either path shows the same "Copied ✓"
 * confirmation so the affordance is unambiguous.
 *
 * Pre-fill is first-person from the sharer ("Apparently I'm The Strategist
 * this week. My Claude Code Wrapped →"). The arrow is part of the canned
 * text on purpose — most chat surfaces render it crisply.
 */
export function ShareSection({ archetypeTitle }: ShareSectionProps) {
  const [copied, setCopied] = useState(false)
  const [pageUrl, setPageUrl] = useState<string>("")

  useEffect(() => {
    if (typeof window !== "undefined") setPageUrl(window.location.href)
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const shareText = `Apparently I'm ${archetypeTitle} this week. My Claude Code Wrapped →`

  const writeToClipboard = useCallback(async () => {
    if (!pageUrl) return
    try {
      await navigator.clipboard.writeText(`${shareText} ${pageUrl}`)
      setCopied(true)
    } catch {
      // Clipboard write failed (e.g. iOS without user gesture context). Stay
      // silent — the user will retry, and the page URL is visible in the bar.
    }
  }, [pageUrl, shareText])

  const onShare = useCallback(async () => {
    if (!pageUrl) return
    const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
    if (canNativeShare) {
      try {
        await navigator.share({ text: shareText, url: pageUrl })
        return
      } catch (err) {
        // User dismissed the share sheet — leave the page as-is.
        if (err instanceof DOMException && err.name === "AbortError") return
        // Anything else — fall through to clipboard so the action still
        // produces *some* result.
      }
    }
    await writeToClipboard()
  }, [pageUrl, shareText, writeToClipboard])

  return (
    <section className="text-center">
      <h2 className="text-2xl sm:text-3xl" style={{ fontFamily: "Georgia, serif", color: "#1A1A1A", fontWeight: 500 }}>
        Share your week
      </h2>
      <p
        className="mx-auto mt-2 max-w-md text-sm sm:text-base"
        style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}
      >
        Show your team what kind of dev you are this week.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onShare}
          disabled={!pageUrl}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-6 py-3 text-base transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: "#D97555",
            color: "#fff",
            fontFamily: "Georgia, serif",
            fontWeight: 500,
          }}
          aria-live="polite"
        >
          {copied ? "Copied ✓" : "Share this Wrapped"}
        </button>
        <button
          type="button"
          onClick={writeToClipboard}
          disabled={!pageUrl}
          className="cursor-pointer text-sm underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}
        >
          {copied ? "Link copied to clipboard" : "or copy the link"}
        </button>
      </div>
    </section>
  )
}
