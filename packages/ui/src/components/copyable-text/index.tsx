import { Check, Copy } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { Icon, type IconSize } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { useToast } from "../toast/useToast.ts"
import { Tooltip } from "../tooltip/tooltip.tsx"

type CopyableTextSize = "sm" | "default"

/** Badge `muted`-like pill; size maps to padding + icon scale. */
const SIZE_CONFIG: Record<CopyableTextSize, { paddingClass: string; iconSize: IconSize }> = {
  sm: {
    paddingClass: "gap-1 px-1.5 py-0.5",
    iconSize: "xs",
  },
  default: {
    paddingClass: "gap-2 px-2.5 py-1.5",
    iconSize: "sm",
  },
}

const TextComponent: Record<CopyableTextSize, typeof Text.H5> = {
  sm: Text.H6,
  default: Text.H5,
}

export function CopyableText({
  value,
  displayValue,
  size = "default",
  ellipsis = false,
  tooltip,
  toastMessage = "Copied to clipboard",
}: {
  readonly value: string
  readonly displayValue?: string
  readonly size?: CopyableTextSize
  readonly ellipsis?: boolean
  readonly tooltip?: string
  readonly toastMessage?: string
}) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMountEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  })

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast({ title: toastMessage })
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }, [value, toast, toastMessage])

  const config = SIZE_CONFIG[size]
  const Label = TextComponent[size]

  const button = (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex w-fit max-w-full shrink-0 items-center self-start rounded-md cursor-pointer transition-colors",
        "border border-muted-foreground/10 bg-muted text-muted-foreground hover:bg-muted/80",
        config.paddingClass,
        ellipsis && "min-w-0",
      )}
    >
      <Label color="foregroundMuted" ellipsis={ellipsis}>
        {displayValue ?? value}
      </Label>
      <Icon
        icon={copied ? Check : Copy}
        size={config.iconSize}
        color={copied ? "success" : "foregroundMuted"}
        className="shrink-0"
      />
    </button>
  )

  if (!tooltip) return button

  return (
    <Tooltip trigger={button} asChild>
      {tooltip}
    </Tooltip>
  )
}
