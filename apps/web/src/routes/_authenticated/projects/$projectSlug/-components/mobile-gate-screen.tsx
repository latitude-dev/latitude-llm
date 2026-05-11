import { Button, Text } from "@repo/ui"
import { Monitor } from "lucide-react"
import { useCallback, useRef, useState } from "react"

export function MobileGateScreen() {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopyLink = useCallback(() => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2500)
  }, [])

  return (
    <div className="flex h-full min-h-dvh w-full flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-6">
          <img src="/favicon.svg" alt="Latitude" className="h-10 w-10" />
          <div className="flex flex-col items-center gap-3">
            <Text.H2 weight="medium">Open on desktop</Text.H2>
            <Text.H5 color="foregroundMuted">
              Latitude is designed for larger screens. Please open this page on a computer to complete the setup.
            </Text.H5>
          </div>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={handleCopyLink}>
          <Monitor className="h-4 w-4" />
          {copied ? "Link copied!" : "Copy link to open on desktop"}
        </Button>
      </div>
    </div>
  )
}
