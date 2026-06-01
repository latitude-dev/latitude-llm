import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Icon,
  Text,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ChevronLeftIcon } from "lucide-react"
import { type KeyboardEvent, useMemo, useState } from "react"
import { useCommandPalette } from "./command-palette-provider.tsx"
import { useGlobalCommands } from "./commands/use-global-commands.tsx"
import { useNavigationCommands } from "./commands/use-navigation-commands.ts"
import { useProjectCommands } from "./commands/use-project-commands.tsx"
import { COMMAND_SECTION_LABELS, COMMAND_SECTION_ORDER, type PaletteCommand, type ParentCommand } from "./types.ts"

/**
 * Token-substring filter: a command matches when every whitespace-separated token of the
 * query is a substring of its searchable text (title + subtitle + keywords). Returns 1/0;
 * cmdk hides zero-score items and preserves source order within a section for ties.
 */
function commandFilter(_value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase()
  if (!query) return 1
  const haystack = (keywords ?? []).join(" ").toLowerCase()
  return query.split(/\s+/).every((token) => haystack.includes(token)) ? 1 : 0
}

function searchKeywords(command: PaletteCommand): string[] {
  return [command.title, command.subtitle, command.keywords].filter((value): value is string => Boolean(value))
}

interface CommandGroupView {
  readonly key: string
  readonly label: string
  readonly commands: readonly PaletteCommand[]
}

/** Groups contextual commands by their `group` sub-heading, preserving registration order. */
function buildContextGroups(commands: readonly PaletteCommand[]): CommandGroupView[] {
  const order: string[] = []
  const byGroup = new Map<string, PaletteCommand[]>()
  for (const command of commands) {
    const label = command.group ?? "Actions"
    const existing = byGroup.get(label)
    if (existing) {
      existing.push(command)
    } else {
      byGroup.set(label, [command])
      order.push(label)
    }
  }
  return order.map((label) => ({ key: `context:${label}`, label, commands: byGroup.get(label) ?? [] }))
}

/**
 * Global Cmd+K command palette. Always mounted in the authenticated layout; opens via the
 * hotkey or the header button. Surfaces navigation, project switching, and global actions;
 * `parent` commands push a keyboard-navigable sub-page (e.g. "Switch organization").
 */
export function CommandPalette() {
  const { open, setOpen, toggle, registeredCommands } = useCommandPalette()
  const [search, setSearch] = useState("")
  // Stack of opened sub-pages; the last entry is the page currently shown.
  const [pageStack, setPageStack] = useState<readonly ParentCommand[]>([])

  useHotkeys([{ hotkey: "Mod+K", callback: toggle, options: { ignoreInputs: true } }])

  const navigationCommands = useNavigationCommands()
  const projectCommands = useProjectCommands()
  const globalCommands = useGlobalCommands()

  const currentPage = pageStack.at(-1) ?? null

  const groups = useMemo<readonly CommandGroupView[]>(() => {
    if (currentPage) {
      return [{ key: currentPage.id, label: currentPage.title, commands: currentPage.getChildren() }]
    }
    const all = [...navigationCommands, ...projectCommands, ...globalCommands]
    const centralGroups = COMMAND_SECTION_ORDER.map((section) => ({
      key: section,
      label: COMMAND_SECTION_LABELS[section],
      commands: all.filter((command) => command.section === section),
    })).filter((group) => group.commands.length > 0)
    // Contextual commands contributed by the current view render ahead of navigation.
    return [...buildContextGroups(registeredCommands), ...centralGroups]
  }, [currentPage, registeredCommands, navigationCommands, projectCommands, globalCommands])

  const resetState = () => {
    setSearch("")
    setPageStack([])
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) resetState()
  }

  const popPage = () => {
    setSearch("")
    setPageStack((stack) => stack.slice(0, -1))
  }

  const execute = (command: PaletteCommand) => {
    if (command.kind === "parent") {
      setSearch("")
      setPageStack((stack) => [...stack, command])
      return
    }
    handleOpenChange(false)
    void command.perform()
  }

  // Backspace on an empty query steps back out of a sub-page.
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && search === "" && pageStack.length > 0) {
      event.preventDefault()
      popPage()
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} loop filter={commandFilter}>
      {currentPage ? (
        <button
          type="button"
          onClick={popPage}
          className="flex w-full items-center gap-1 border-b border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" />
          <Text.H6 color="foregroundMuted">{currentPage.title}</Text.H6>
        </button>
      ) : null}
      <CommandInput
        placeholder={
          currentPage ? `Search ${currentPage.title.toLowerCase()}…` : "Search projects, navigate, run actions…"
        }
        value={search}
        onValueChange={setSearch}
        onKeyDown={handleInputKeyDown}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.key} heading={group.label}>
            {group.commands.map((command) => (
              <CommandItem
                key={command.id}
                value={command.id}
                keywords={searchKeywords(command)}
                onSelect={() => execute(command)}
              >
                {command.leading ?? <Icon icon={command.icon} size="sm" color="foregroundMuted" />}
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Text.H5 ellipsis noWrap>
                    {command.title}
                  </Text.H5>
                  {command.subtitle ? (
                    <Text.H6 color="foregroundMuted" ellipsis noWrap>
                      {command.subtitle}
                    </Text.H6>
                  ) : null}
                </span>
                {command.kind === "parent" ? (
                  <ChevronLeftIcon className="size-3.5 rotate-180 text-muted-foreground" />
                ) : null}
                {command.badge}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <CommandFooter>
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-muted px-1 font-mono">↑↓</kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-muted px-1 font-mono">↵</kbd> select
        </span>
        {currentPage ? (
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-muted px-1 font-mono">⌫</kbd> back
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-muted px-1 font-mono">esc</kbd> close
          </span>
        )}
      </CommandFooter>
    </CommandDialog>
  )
}
