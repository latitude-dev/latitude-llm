import { Check, Clipboard } from "lucide-react"
import type { MouseEvent } from "react"
import { useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { Button } from "../button/button.tsx"
import { Icon, type IconSize } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
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
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    },
    [value],
  )

  useMountEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  })

  const button = (
    <Button variant="ghost" size="icon" onClick={handleCopy} className={className}>
      <Icon icon={copied ? Check : Clipboard} size={size} color={copied ? "success" : "foregroundMuted"} />
    </Button>
  )

  if (!tooltip) return button

  return (
    <Tooltip trigger={button}>
      <Text.Mono size="h6">{tooltip}</Text.Mono>
    </Tooltip>
  )
}
