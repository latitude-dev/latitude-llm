import { Check, Clipboard } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { Icon, type IconSize } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { useToast } from "../toast/useToast.ts"
import { Tooltip } from "../tooltip/tooltip.tsx"

type CopyableTextSize = "sm" | "default"

const SIZE_CONFIG: Record<CopyableTextSize, { buttonClass: string; iconSize: IconSize }> = {
  sm: {
    buttonClass: "gap-1 px-1.5 py-0.5 -mx-1.5",
    iconSize: "xs",
  },
  default: {
    buttonClass: "gap-2 px-2.5 py-1.5 -mx-2.5",
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
        "flex items-center min-w-0 rounded-md cursor-pointer hover:bg-muted transition-colors",
        config.buttonClass,
      )}
    >
      <Label color="foregroundMuted" ellipsis={ellipsis}>
        {displayValue ?? value}
      </Label>
      <Icon
        icon={copied ? Check : Clipboard}
        size={config.iconSize}
        color={copied ? "success" : "foregroundMuted"}
        className="shrink-0"
      />
    </button>
  )

  if (!tooltip) return button

  return (
    <Tooltip trigger={button}>
      <Text.Mono size="h6">{tooltip}</Text.Mono>
    </Tooltip>
  )
}
