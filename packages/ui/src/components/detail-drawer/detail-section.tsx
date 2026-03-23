import { ChevronDown, ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useHover } from "../../hooks/use-hover.ts"
import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"

function Header({
  icon,
  label,
  open,
  onClick,
}: {
  icon: ReactNode
  label: string
  open: boolean
  onClick: () => void
}) {
  const [ref, hover] = useHover<HTMLButtonElement>()

  return (
    <button
      ref={ref}
      type="button"
      className="flex flex-row items-center gap-2 cursor-pointer text-muted-foreground hover:text-primary"
      onClick={onClick}
    >
      {icon}
      <Text.H6 color={hover ? "primary" : "foregroundMuted"}>{label}</Text.H6>

      <hr className={cn("flex-1 border-t-2 border-dashed border-border mx-2", { "border-accent": hover })} />

      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )
}

export function DetailSection({
  icon,
  label,
  children,
  defaultOpen = true,
  contentClassName,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly defaultOpen?: boolean
  readonly contentClassName?: string
  readonly children: ReactNode | (() => ReactNode)
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="flex flex-col gap-2">
      <Header icon={icon} label={label} open={open} onClick={() => setOpen((prev) => !prev)} />
      {open && (
        <div className={cn("flex flex-col pl-2 max-h-60 overflow-y-auto", contentClassName)}>
          {typeof children === "function" ? children() : children}
        </div>
      )}
    </div>
  )
}
