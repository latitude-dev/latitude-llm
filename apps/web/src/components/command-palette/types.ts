import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** Groups commands into ordered, labelled sections in the palette. */
type CommandSection = "navigation" | "projects" | "actions"

interface BasePaletteCommand {
  /** Globally unique id (also used as cmdk's item value). */
  readonly id: string
  readonly title: string
  readonly icon: LucideIcon
  readonly section: CommandSection
  /** Custom leading visual that overrides `icon` (e.g. a project emoji). */
  readonly leading?: ReactNode
  /** Muted secondary text shown after the title (e.g. "Settings → Members"). */
  readonly subtitle?: string
  /** Trailing element (e.g. a status badge). */
  readonly badge?: ReactNode
  /** Extra search terms, beyond title/subtitle, used by the palette filter. */
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

export const COMMAND_SECTION_ORDER: readonly CommandSection[] = ["navigation", "projects", "actions"]

export const COMMAND_SECTION_LABELS: Record<CommandSection, string> = {
  navigation: "Navigation",
  projects: "Projects",
  actions: "Actions",
}
