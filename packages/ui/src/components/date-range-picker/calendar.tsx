import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"
import { cn } from "../../utils/cn.ts"
import { Icon } from "../icons/icons.tsx"

export function Calendar(props: DayPickerProps) {
  return (
    <DayPicker
      {...props}
      className="select-none"
      classNames={{
        months: "flex flex-col",
        month: "space-y-3",
        caption: "relative flex items-center justify-center px-1 pt-1",
        caption_label: "text-sm font-medium text-foreground",
        nav: "contents",
        nav_button:
          "inline-flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "h-8 w-9 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        row: "mt-1.5 flex w-full",
        cell: cn(
          "relative h-9 w-9 p-0 text-center text-sm",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "first:[&:has([aria-selected])]:rounded-l-md",
          "last:[&:has([aria-selected])]:rounded-r-md",
          "focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-muted",
          "[&:has([aria-selected])]:text-foreground",
        ),
        day: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-sm font-normal transition-colors",
          "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ),
        day_selected:
          "bg-foreground text-background font-medium hover:bg-foreground/90 hover:text-background aria-selected:opacity-100",
        day_today: "bg-primary text-primary-foreground font-medium hover:bg-primary/90 hover:text-primary-foreground",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-30",
        day_hidden: "invisible",
        day_range_middle:
          "day-range-middle !rounded-none !bg-transparent !text-foreground !font-normal hover:!bg-transparent hover:!text-foreground",
        day_range_start:
          "day-range-start !bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background",
        day_range_end: "day-range-end !bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background",
      }}
      components={{
        IconLeft: () => <Icon icon={ChevronLeft} size="sm" />,
        IconRight: () => <Icon icon={ChevronRight} size="sm" />,
      }}
    />
  )
}
