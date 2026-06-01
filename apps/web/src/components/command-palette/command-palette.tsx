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
import { useMemo, useState } from "react"
import { useCommandPalette } from "./command-palette-provider.tsx"
import { useGlobalCommands } from "./commands/use-global-commands.ts"
import { useNavigationCommands } from "./commands/use-navigation-commands.ts"
import { useProjectCommands } from "./commands/use-project-commands.tsx"
import { COMMAND_SECTION_LABELS, COMMAND_SECTION_ORDER, type PaletteCommand } from "./types.ts"

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

/**
 * Global Cmd+K command palette. Always mounted in the authenticated layout; opens via the
 * hotkey or the header button. Phase 1 surfaces navigation, project switching, and global
 * actions; contextual commands and entity search are layered on in later phases.
 */
export function CommandPalette() {
  const { open, setOpen, toggle } = useCommandPalette()
  const [search, setSearch] = useState("")

  useHotkeys([{ hotkey: "Mod+K", callback: toggle, options: { ignoreInputs: true } }])

  const navigationCommands = useNavigationCommands()
  const projectCommands = useProjectCommands()
  const globalCommands = useGlobalCommands()

  const sections = useMemo(() => {
    const all = [...navigationCommands, ...projectCommands, ...globalCommands]
    return COMMAND_SECTION_ORDER.map((section) => ({
      section,
      label: COMMAND_SECTION_LABELS[section],
      commands: all.filter((command) => command.section === section),
    })).filter((group) => group.commands.length > 0)
  }, [navigationCommands, projectCommands, globalCommands])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setSearch("")
  }

  const execute = (command: PaletteCommand) => {
    handleOpenChange(false)
    void command.perform()
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} loop filter={commandFilter}>
      <CommandInput placeholder="Search projects, navigate, run actions…" value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {sections.map((group) => (
          <CommandGroup key={group.section} heading={group.label}>
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
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-muted px-1 font-mono">esc</kbd> close
        </span>
      </CommandFooter>
    </CommandDialog>
  )
}
