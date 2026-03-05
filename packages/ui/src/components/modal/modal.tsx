import type { ReactNode } from "react"

import { type ZIndex, zIndex as globalZIndex } from "../../tokens/index.ts"
import { cn } from "../../utils/cn.ts"
import { Button } from "../button/button.tsx"
import {
  Dialog,
  DialogClose,
  DialogContent,
  type DialogContentProps,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type FooterProps,
} from "./primitives.tsx"

export type ModalProps = {
  title?: string
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
  description?: string | ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: "small" | "regular" | "medium" | "large" | "xl" | "full"
  height?: DialogContentProps["height"]
  dismissible?: boolean
  scrollable?: boolean
  zIndex?: ZIndex
  footerAlign?: FooterProps["align"]
}

function Modal({
  open,
  defaultOpen,
  onOpenChange,
  children,
  footer,
  title,
  description,
  size = "regular",
  height = "content",
  dismissible = false,
  scrollable = true,
  zIndex = "modal",
  footerAlign = "right",
}: ModalProps) {
  const dialogProps: Record<string, unknown> = {}
  if (open !== undefined) dialogProps.open = open
  if (defaultOpen !== undefined) dialogProps.defaultOpen = defaultOpen
  if (onOpenChange !== undefined) dialogProps.onOpenChange = onOpenChange

  return (
    <Dialog {...dialogProps}>
      <DialogContent
        dismissible={dismissible}
        height={height}
        className={cn("flex flex-col", globalZIndex[zIndex], {
          "max-w-modal-sm": size === "small",
          "max-w-modal": size === "regular",
          "max-w-modal-md": size === "medium",
          "max-w-modal-lg": size === "large",
          "max-w-modal-xl": size === "xl",
          "max-w-[97.5%]": size === "full",
        })}
      >
        <div className="flex flex-col relative h-full overflow-hidden">
          {title || !!description ? (
            <div className="flex flex-col gap-y-4 pb-6">
              {(title || !!description) && (
                <div className="px-6 pt-6">
                  <DialogHeader>
                    {title && <DialogTitle>{title}</DialogTitle>}
                    {!!description && <DialogDescription>{description}</DialogDescription>}
                  </DialogHeader>
                </div>
              )}
            </div>
          ) : null}

          {children ? (
            <div
              className={cn("px-6", {
                "overflow-y-auto custom-scrollbar pb-6": scrollable,
                "min-h-0 flex-grow flex flex-col": !scrollable,
              })}
            >
              {children}
            </div>
          ) : null}

          {footer ? (
            <div
              className={cn("px-6 border-border border-t rounded-b-2xl", {
                "bg-background-gray py-4": !!footer,
              })}
            >
              <DialogFooter align={footerAlign}>{footer}</DialogFooter>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const CloseTrigger = ({ children = <Button variant="outline">Close</Button> }: { children?: ReactNode }) => {
  return <DialogClose asChild>{children}</DialogClose>
}

export { Modal, CloseTrigger }
