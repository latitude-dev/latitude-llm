import { cn } from "@repo/ui"
import { Children, isValidElement, type ReactElement, type ReactNode } from "react"

interface ListingLayoutProps {
  readonly children: ReactNode
  readonly className?: string
}

function ListingContent({ children }: { readonly children: ReactNode }) {
  return <>{children}</>
}

function ListingAside({ children }: { readonly children: ReactNode }) {
  return <>{children}</>
}

function isElementWithType(
  c: ReactNode,
  type: typeof ListingLayout.Content | typeof ListingLayout.Aside,
): c is ReactElement<{ children?: ReactNode }> {
  return isValidElement(c) && c.type === type
}

function ListingLayout({ children, className }: ListingLayoutProps) {
  const childArray = Children.toArray(children)
  const contentChild = childArray.find((c): c is ReactElement<{ children?: ReactNode }> =>
    isElementWithType(c, ListingLayout.Content),
  )
  const asideChild = childArray.find((c): c is ReactElement<{ children?: ReactNode }> =>
    isElementWithType(c, ListingLayout.Aside),
  )
  const content = contentChild
    ? contentChild.props.children
    : childArray.filter((c) => !isElementWithType(c, ListingLayout.Aside))
  const aside = asideChild ? asideChild.props.children : null

  const main = <div className={cn("flex flex-col h-full gap-3", className)}>{content}</div>
  if (aside == null) return main
  return (
    <div className="relative flex flex-row h-full">
      <div className="flex-1 min-w-0 flex flex-col">{main}</div>
      {aside ? <div className="relative z-10">{aside}</div> : null}
    </div>
  )
}

ListingLayout.Content = ListingContent
ListingLayout.Aside = ListingAside

interface ActionsProps {
  readonly children: ReactNode
  readonly className?: string
}

function Actions({ children, className }: ActionsProps) {
  return <div className={cn("flex flex-col p-6 pb-0 gap-3", className)}>{children}</div>
}

interface ActionsRowProps {
  readonly children: ReactNode
  readonly className?: string
}

function ActionsRow({ children, className }: ActionsRowProps) {
  return <div className={cn("flex flex-row gap-2 items-center justify-between min-w-0", className)}>{children}</div>
}

interface ActionRowItemProps {
  readonly children?: ReactNode
  readonly className?: string
}

function ActionRowItem({ children, className }: ActionRowItemProps) {
  return <div className={cn("flex flex-row gap-2 items-center min-w-0 shrink-0", className)}>{children}</div>
}

interface ListProps {
  readonly children: ReactNode
  readonly className?: string
}

function List({ children, className }: ListProps) {
  return <div className={cn("min-h-0 min-w-0 grow p-6 pt-0 pr-0 flex flex-col", className)}>{children}</div>
}

function Body({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn("flex flex-row flex-1 min-h-0 min-w-0 overflow-hidden", className)}>{children}</div>
}

function Sidebar({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn("flex flex-col h-full w-[280px] min-w-[280px] shrink-0 border-r bg-background", className)}>
      {children}
    </div>
  )
}

ListingLayout.ActionRowItem = ActionRowItem
ListingLayout.ActionsRow = ActionsRow
ListingLayout.Actions = Actions
ListingLayout.Body = Body
ListingLayout.Sidebar = Sidebar
ListingLayout.List = List

export { ListingLayout }
