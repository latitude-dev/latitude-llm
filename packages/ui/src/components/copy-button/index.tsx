import { Check, Clipboard } from "lucide-react"
import type { MouseEvent } from "react"
import { useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { Button } from "../button/button.tsx"
import { Icon, type IconSize } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { useToast } from "../toast/useToast.ts"
import { Tooltip } from "../tooltip/tooltip.tsx"

export function CopyButton({
  value,
  className,
  tooltip,
  size = "sm",
}: {
  readonly value: string
  readonly className?: string
  readonly tooltip?: string
  size?: IconSize
}) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const mountedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  const handleCopy = useCallback(
    async (e: MouseEvent) => {
      e.stopPropagation()
      const requestId = ++requestIdRef.current
      setCopied(false)
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      try {
        await navigator.clipboard.writeText(value)
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        setCopied(true)
        timeoutRef.current = setTimeout(() => {
          if (requestId !== requestIdRef.current) return
          timeoutRef.current = null
          setCopied(false)
        }, 2000)
      } catch {
        if (mountedRef.current && requestId === requestIdRef.current) {
          toast({ title: "Unable to copy to clipboard" })
        }
      }
    },
    [value, toast],
  )

  useMountEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  })

  const button = (
    <Button variant="ghost" size="icon" onClick={handleCopy} className={className}>
      <Icon icon={copied ? Check : Clipboard} size={size} color={copied ? "success" : "foregroundMuted"} />
    </Button>
  )

  if (!tooltip) return button

  return (
    <Tooltip asChild trigger={button}>
      <Text.Mono size="h6">{tooltip}</Text.Mono>
    </Tooltip>
  )
}
