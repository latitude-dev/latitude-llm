import { AlertCircleIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { TextColor } from "../../tokens/colors.ts"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"
import { AlertDescription, type AlertProps, AlertRoot, AlertTitle } from "./primitives/index.tsx"

type Props = {
  variant?: AlertProps["variant"]
  title?: string | ReactNode
  description?: string | ReactNode
  direction?: "row" | "column"
  spacing?: "xsmall" | "small" | "medium"
  cta?: ReactNode
  showIcon?: boolean
  centered?: boolean
  className?: string
}

const IconColor: Record<string, TextColor> = {
  destructive: "destructiveMutedForeground",
  success: "successMutedForeground",
  warning: "warningMutedForeground",
  default: "foregroundMuted",
}

export function Alert({
  title,
  description,
  direction = "row",
  cta,
  showIcon = true,
  variant = "default",
  centered = false,
  spacing = "medium",
  className,
}: Props) {
  return (
    <AlertRoot variant={variant} className={className}>
      {showIcon && (
        <Icon
          icon={AlertCircleIcon}
          color={variant ? IconColor[variant] || "foreground" : "foreground"}
          className={cn({ "mt-0.5": !title })}
        />
      )}
      <div
        className={cn("flex items-start justify-between", {
          "flex-row ": direction === "row",
          "flex-col": direction === "column",
          "items-center justify-center": centered,
          "gap-4 lg:gap-8": spacing === "medium",
          "gap-2.5 lg:gap-5": spacing === "small",
          "gap-1.5 lg:gap-3.5": spacing === "xsmall",
        })}
      >
        <div className="flex flex-col gap-2 whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
          {title && <AlertTitle>{title}</AlertTitle>}
          {description && <AlertDescription>{description}</AlertDescription>}
        </div>
        {cta}
      </div>
    </AlertRoot>
  )
}
