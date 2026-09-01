import { cn, Text } from "@repo/ui"
import { Children, forwardRef, isValidElement, type ReactElement, type ReactNode } from "react"

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
    <div className="@container relative flex flex-row h-full">
      <div className="flex-1 min-w-0 flex flex-col">{main}</div>
      {aside ? (
        <div className="relative z-10 @max-[48rem]:absolute @max-[48rem]:inset-y-0 @max-[48rem]:right-0 @max-[48rem]:z-20 @max-[48rem]:shadow-xl">
          {aside}
        </div>
      ) : null}
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
  return (
    <div className={cn("flex flex-row flex-wrap gap-2 items-center justify-between min-w-0", className)}>
      {children}
    </div>
  )
}

interface ActionRowItemProps {
  readonly children?: ReactNode
  readonly className?: string
}

function ActionRowItem({ children, className }: ActionRowItemProps) {
  return <div className={cn("flex flex-row flex-wrap gap-2 items-center min-w-0", className)}>{children}</div>
}

interface HeaderProps {
  readonly title: ReactNode
  /** Shown inline after the title (e.g. queue type badge). */
  readonly badge?: ReactNode
  readonly description?: ReactNode
  /** Right-aligned controls beside the title; wrap below it when the header is too narrow to fit both. */
  readonly actions?: ReactNode
  /** Right-aligned control below `actions`, centered against the title/description block. */
  readonly titleAside?: ReactNode
  readonly className?: string
}

function Header({ title, badge, description, actions, titleAside, className }: HeaderProps) {
  return (
    <div className={cn("@container flex flex-col gap-1 p-6 pb-0", className)}>
      <div className="flex min-w-0 flex-row flex-wrap items-start gap-x-4 gap-y-2 @max-[45rem]:flex-col">
        <div className="flex min-w-64 flex-1 flex-col gap-1 @max-[45rem]:min-w-0 @max-[45rem]:flex-none">
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
        {actions || titleAside ? (
          <div className="ml-auto flex max-w-full shrink-0 flex-col items-end gap-2 @max-[45rem]:w-full @max-[45rem]:items-stretch">
            {actions ? (
              <div className="flex max-w-full flex-row flex-wrap items-center gap-2 @max-[45rem]:w-full @max-[45rem]:justify-between">
                {actions}
              </div>
            ) : null}
            {titleAside ? (
              <div className="flex max-w-full flex-row items-center gap-2 @max-[45rem]:w-full">{titleAside}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

interface ListProps {
  readonly children: ReactNode
  readonly className?: string
}

const List = forwardRef<HTMLDivElement, ListProps>(function List({ children, className }, ref) {
  return (
    <div ref={ref} className={cn("min-h-0 min-w-0 grow p-6 pt-0 flex flex-col", className)}>
      {children}
    </div>
  )
})

function Body({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={cn("@container relative flex flex-row flex-1 min-h-0 min-w-0 overflow-hidden", className)}>
      {children}
    </div>
  )
}

function Sidebar({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col h-full w-[280px] min-w-[280px] shrink-0 border-r bg-background",
        "@max-[48rem]:absolute @max-[48rem]:inset-y-0 @max-[48rem]:left-0 @max-[48rem]:z-20 @max-[48rem]:shadow-xl",
        className,
      )}
    >
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
