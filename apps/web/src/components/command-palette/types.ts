import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Groups commands into ordered, labelled sections. `context` commands are contributed by
 * the current view through the registry and render at the top, grouped by their `group`.
 */
type CommandSection = "context" | "search" | "navigation" | "projects" | "actions"

interface BasePaletteCommand {
  /** Globally unique id (also used as cmdk's item value). */
  readonly id: string
  readonly title: string
  /**
   * Optional rich rendering of the title. When set, this is rendered instead of the plain `title`
   * string (e.g. to emphasize a query and mute surrounding scaffolding). `title` is still required
   * — it remains the value used by the text matcher and any plain-text contexts.
   */
  readonly titleNode?: ReactNode
  readonly icon: LucideIcon
  readonly section: CommandSection
  /** Sub-heading for contextual commands (e.g. "Issue", "Trace"). */
  readonly group?: string
  /** Custom leading visual that overrides `icon` (e.g. a project emoji). */
  readonly leading?: ReactNode
  /** Muted secondary text shown after the title (e.g. "Settings → Members"). */
  readonly subtitle?: string
  /** Trailing element (e.g. a status badge). */
  readonly badge?: ReactNode
  /** Extra search terms, beyond title/subtitle, used by the palette matcher. */
  readonly keywords?: string
}

/** A command that runs and closes the palette. */
export interface ActionCommand extends BasePaletteCommand {
  readonly kind?: "action"
  /** Runs the command. The palette closes around this call. */
  readonly perform: () => void | Promise<void>
}

/** A command that opens a sub-page listing its child commands (keyboard drill-down). */
export interface ParentCommand extends BasePaletteCommand {
  readonly kind: "parent"
  readonly getChildren: () => readonly PaletteCommand[]
}

export type PaletteCommand = ActionCommand | ParentCommand

/** Central sections, in display order. Context groups are rendered ahead of these. */
export const COMMAND_SECTION_ORDER: readonly CommandSection[] = ["navigation", "projects", "actions"]

export const COMMAND_SECTION_LABELS: Record<CommandSection, string> = {
  context: "Actions",
  search: "Search",
  navigation: "Navigation",
  projects: "Projects",
  actions: "Actions",
}
