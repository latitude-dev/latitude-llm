import { Check, Clipboard } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }, [value])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className={className}>
      <Icon icon={copied ? Check : Clipboard} size="sm" color={copied ? "success" : "foregroundMuted"} />
    </Button>
  )
}
