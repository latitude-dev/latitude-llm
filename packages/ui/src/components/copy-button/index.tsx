import { Check, Clipboard } from "lucide-react"
import type { MouseEvent } from "react"
import { useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { Button } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"

export function CopyButton({
  value,
  className,
  tooltip,
}: {
  readonly value: string
  readonly className?: string
  readonly tooltip?: string
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
    <Button flat variant="ghost" size="icon" onClick={handleCopy} className={className}>
      <Icon icon={copied ? Check : Clipboard} size="sm" color={copied ? "success" : "foregroundMuted"} />
    </Button>
  )

  if (!tooltip) return button

  return (
    <Tooltip trigger={button}>
      <Text.Mono size="h6">{tooltip}</Text.Mono>
    </Tooltip>
  )
}
