import type { ReactNode } from "react"

import { cn } from "../../utils/cn.js"
import { Button, type ButtonProps } from "../button/button.tsx"
import { Text } from "../text/text.tsx"

function ListingButton({ variant = "outline", children, ...rest }: ButtonProps) {
  return (
    <Button variant={variant} {...rest}>
      {children}
    </Button>
  )
}

type TitleWithActionsVerticalAlignment = "center" | "bottom"

const TitleWithActions = ({
  title,
  actions,
  verticalAlignment = "center",
}: {
  title: string | ReactNode
  actions?: ReactNode
  verticalAlignment?: TitleWithActionsVerticalAlignment
}) => {
  return (
    <div
      className={cn("flex flex-row flex-grow min-w-0 justify-between gap-4", {
        "items-center": verticalAlignment === "center",
        "items-end": verticalAlignment === "bottom",
      })}
    >
      {typeof title === "string" ? <Text.H4 weight="bold">{title}</Text.H4> : title}
      {actions ? <div className="flex gap-1 flex-grow shrink-0 justify-end gap-x-2">{actions}</div> : null}
    </div>
  )
}

const TableWithHeader = ({
  title,
  description,
  actions,
  table,
  takeVerticalSpace,
  verticalAlignment = "center",
}: {
  title: string | ReactNode
  description?: string | ReactNode
  actions?: ReactNode
  verticalAlignment?: TitleWithActionsVerticalAlignment
  table?: ReactNode
  takeVerticalSpace?: boolean
}) => {
  return (
    <div
      className={cn("flex flex-col gap-4", {
        "flex-grow min-h-0": takeVerticalSpace,
      })}
    >
      <div className="flex flex-col gap-y-4">
        <TitleWithActions title={title} actions={actions} verticalAlignment={verticalAlignment} />
        {description ? <Text.H5 color="foregroundMuted">{description}</Text.H5> : null}
      </div>
      {table && (
        <div
          className={cn("flex", {
            "flex-grow relative min-h-0 min-w-0": takeVerticalSpace,
          })}
        >
          {table}
        </div>
      )}
    </div>
  )
}

TableWithHeader.Button = ListingButton

export { TableWithHeader, TitleWithActions }
