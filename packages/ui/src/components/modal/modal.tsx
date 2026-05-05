import type { ComponentProps, ReactNode } from "react"

import { zIndex as globalZIndex, type ZIndex } from "../../tokens/zIndex.ts"
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

export type ModalSize = "small" | "regular" | "medium" | "large" | "xl" | "full"

export type ModalProps = {
  title?: string
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
  description?: string | ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: ModalSize
  height?: DialogContentProps["height"]
  dismissible?: boolean
  scrollable?: boolean
  zIndex?: ZIndex
  footerAlign?: FooterProps["align"]
}

const sizeClassName = (size: ModalSize = "regular") =>
  cn({
    "max-w-modal-sm": size === "small",
    "max-w-modal": size === "regular",
    "max-w-modal-md": size === "medium",
    "max-w-modal-lg": size === "large",
    "max-w-modal-xl": size === "xl",
    "max-w-[97.5%]": size === "full",
  })

export type ModalRootProps = ComponentProps<typeof Dialog>

function ModalRoot(props: ModalRootProps) {
  return <Dialog {...props} />
}

export type ModalContentProps = Omit<ComponentProps<typeof DialogContent>, "dismissible" | "height"> & {
  dismissible?: boolean
  height?: DialogContentProps["height"]
  size?: ModalSize
  zIndex?: ZIndex
}

function ModalContent({
  dismissible = false,
  height = "content",
  size = "regular",
  zIndex = "modal",
  className,
  children,
  ...rest
}: ModalContentProps) {
  return (
    <DialogContent
      dismissible={dismissible}
      height={height}
      className={cn("flex flex-col", globalZIndex[zIndex], sizeClassName(size), className)}
      {...rest}
    >
      <div className="relative flex h-full flex-col overflow-hidden">{children}</div>
    </DialogContent>
  )
}

export type ModalHeaderProps = {
  title?: string
  description?: string | ReactNode
  children?: ReactNode
  className?: string
}

function ModalHeader({ title, description, children, className }: ModalHeaderProps) {
  if (!title && !description && !children) {
    return null
  }

  return (
    <div className={cn("flex flex-col gap-y-4 pb-6", className)}>
      <div className="px-6 pt-6">
        {children ?? (
          <DialogHeader>
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        )}
      </div>
    </div>
  )
}

export type ModalBodyProps = {
  scrollable?: boolean
  children: ReactNode
  className?: string
}

function ModalBody({ scrollable = true, children, className }: ModalBodyProps) {
  return (
    <div
      className={cn(
        "px-6",
        {
          "min-h-0 flex-1 overflow-y-auto pb-6": scrollable,
          "flex min-h-0 grow flex-col": !scrollable,
        },
        className,
      )}
    >
      {children}
    </div>
  )
}

export type ModalFooterProps = {
  align?: FooterProps["align"]
  children: ReactNode
  className?: string
}

function ModalFooter({ align = "right", children, className }: ModalFooterProps) {
  return (
    <div className={cn("rounded-b-2xl border-border border-t bg-background-gray px-6 py-4", className)}>
      <DialogFooter align={align}>{children}</DialogFooter>
    </div>
  )
}

function ModalBase({
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

  const showHeader = Boolean(title) || Boolean(description)

  return (
    <ModalRoot {...dialogProps}>
      <ModalContent dismissible={dismissible} height={height} size={size} zIndex={zIndex}>
        {showHeader ? (
          <ModalHeader
            {...(title !== undefined && title !== "" ? { title } : {})}
            {...(description !== undefined && Boolean(description) ? { description } : {})}
          />
        ) : null}
        {children ? <ModalBody scrollable={scrollable}>{children}</ModalBody> : null}
        {footer ? <ModalFooter align={footerAlign}>{footer}</ModalFooter> : null}
      </ModalContent>
    </ModalRoot>
  )
}

ModalRoot.displayName = "Modal.Root"
ModalContent.displayName = "Modal.Content"
ModalHeader.displayName = "Modal.Header"
ModalBody.displayName = "Modal.Body"
ModalFooter.displayName = "Modal.Footer"

export const Modal = Object.assign(ModalBase, {
  Root: ModalRoot,
  Content: ModalContent,
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
})

const CloseTrigger = ({ children = <Button variant="outline">Close</Button> }: { children?: ReactNode }) => {
  return <DialogClose asChild>{children}</DialogClose>
}

export { CloseTrigger }
