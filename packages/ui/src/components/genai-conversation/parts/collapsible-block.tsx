import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { cn } from "../../../utils/cn.ts"

export function CollapsibleBlock({
  icon,
  label,
  defaultOpen = false,
  variant = "default",
  statusIcon,
  children,
}: {
  readonly icon: ReactNode
  readonly label: ReactNode
  readonly defaultOpen?: boolean
  readonly variant?: "default" | "destructive"
  readonly statusIcon?: ReactNode | undefined
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={cn("flex flex-col rounded-lg border max-w-[600px]", {
        "border-border": variant === "default",
        "border-destructive": variant === "destructive",
      })}
    >
      <button
        type="button"
        className="flex flex-row items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-lg"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        {statusIcon}
        {open ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
