import { cn, Text } from "@repo/ui"
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

interface HeaderProps {
  readonly title: ReactNode
  /** Shown inline after the title (e.g. queue type badge). */
  readonly badge?: ReactNode
  readonly description?: ReactNode
  /** Right-aligned controls on the same row as the title (e.g. primary actions). */
  readonly actions?: ReactNode
  readonly className?: string
}

function Header({ title, badge, description, actions, className }: HeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1 p-6 pb-0", className)}>
      <div className="flex min-w-0 flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
            {typeof title === "string" ? <Text.H4 className="min-w-0 shrink">{title}</Text.H4> : title}
            {badge ? <span className="shrink-0 flex">{badge}</span> : null}
          </div>
          {description !== undefined && description !== null ? (
            typeof description === "string" ? (
              <Text.H5 color="foregroundMuted">{description}</Text.H5>
            ) : (
              description
            )
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-row items-center gap-2 self-start">{actions}</div> : null}
      </div>
    </div>
  )
}

interface ListProps {
  readonly children: ReactNode
  readonly className?: string
}

function List({ children, className }: ListProps) {
  return <div className={cn("min-h-0 min-w-0 grow p-6 pt-0 flex flex-col", className)}>{children}</div>
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
ListingLayout.Header = Header
ListingLayout.Body = Body
ListingLayout.Sidebar = Sidebar
ListingLayout.List = List

/**
 * Use with `InfiniteTable` / `ProjectTracesTable` inside `ListingLayout.List` so the scroll area
 * height follows the table (horizontal scrollbar sits under the last row when the list is short).
 */
export const listingLayoutIntrinsicScroll = {
  infiniteTable: { scrollAreaLayout: "intrinsic" as const, className: "max-h-full" },
  projectTracesTable: { scrollAreaLayout: "intrinsic" as const, scrollContainerClassName: "max-h-full" },
}

export { ListingLayout }
