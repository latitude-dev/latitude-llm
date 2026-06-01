import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  Icon,
  Text,
} from "@repo/ui"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ChevronLeftIcon, Loader2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { useCommandPalette, useCommandPaletteState } from "./command-palette-provider.tsx"
import { useGlobalCommands } from "./commands/use-global-commands.tsx"
import { useIssueSearchCommands } from "./commands/use-issue-search-commands.ts"
import { useMonitorSearchCommands } from "./commands/use-monitor-search-commands.ts"
import { useNavigationCommands } from "./commands/use-navigation-commands.ts"
import { useProjectCommands } from "./commands/use-project-commands.tsx"
import { useProjectSearchCommands } from "./commands/use-project-search-commands.ts"
import { COMMAND_SECTION_LABELS, COMMAND_SECTION_ORDER, type PaletteCommand, type ParentCommand } from "./types.ts"

/**
 * Token-substring matcher: a command matches when every whitespace-separated token of the
 * query is a substring of its searchable text (title + subtitle + keywords). We filter in
 * React (cmdk runs with `shouldFilter={false}`) rather than via cmdk's built-in filter —
 * cmdk snapshots an item's keywords on first registration and won't pick up keyword changes
 * for items with a stable value, which made query-driven rows (e.g. "Search traces for …")
 * silently stop matching as the query grew.
 */
function commandMatches(command: PaletteCommand, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [command.title, command.subtitle, command.keywords]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
  return q.split(/\s+/).every((token) => haystack.includes(token))
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
  const { setOpen } = useCommandPalette()
  const { open, registeredCommands } = useCommandPaletteState()
  const [search, setSearch] = useState("")
  // Stack of opened sub-pages; the last entry is the page currently shown.
  const [pageStack, setPageStack] = useState<readonly ParentCommand[]>([])
  // The query active at each ancestor level, saved on push so going back restores it.
  const [savedSearches, setSavedSearches] = useState<readonly string[]>([])

  const navigationCommands = useNavigationCommands()
  const projectCommands = useProjectCommands()
  const globalCommands = useGlobalCommands()
  const { commands: issueResults, isLoading: issuesLoading } = useIssueSearchCommands(search)
  const monitorResults = useMonitorSearchCommands(search)
  const {
    datasets: datasetResults,
    savedSearches: savedSearchResults,
    tracesFallback,
  } = useProjectSearchCommands(search)

  const currentPage = pageStack.at(-1) ?? null

  const groups = useMemo<readonly CommandGroupView[]>(() => {
    const matches = (command: PaletteCommand) => commandMatches(command, search)

    if (currentPage) {
      return [{ key: currentPage.id, label: currentPage.title, commands: currentPage.getChildren().filter(matches) }]
    }

    // Contextual commands (contributed by the current view) render first, grouped by sub-heading.
    const contextGroups = buildContextGroups(registeredCommands.filter(matches))

    // In-project search results. Issues are already curated by the hook (semantic + substring),
    // so they render as-is; datasets/saved searches are full project lists we filter here.
    const entityGroups: CommandGroupView[] = []
    if (issueResults.length > 0) entityGroups.push({ key: "issues", label: "Issues", commands: issueResults })
    const monitors = monitorResults.filter(matches)
    if (monitors.length > 0) entityGroups.push({ key: "monitors", label: "Monitors", commands: monitors })
    const datasets = datasetResults.filter(matches)
    if (datasets.length > 0) entityGroups.push({ key: "datasets", label: "Datasets", commands: datasets })
    const saved = savedSearchResults.filter(matches)
    if (saved.length > 0) entityGroups.push({ key: "saved-searches", label: "Saved searches", commands: saved })

    const central = [...navigationCommands, ...projectCommands, ...globalCommands].filter(matches)
    const centralGroups = COMMAND_SECTION_ORDER.map((section) => ({
      key: section,
      label: COMMAND_SECTION_LABELS[section],
      commands: central.filter((command) => command.section === section),
    })).filter((group) => group.commands.length > 0)

    // The "Search traces for …" fallback is the query itself, so it always shows last.
    const trailingGroups =
      tracesFallback.length > 0 ? [{ key: "traces", label: "Traces", commands: tracesFallback }] : []

    return [...contextGroups, ...entityGroups, ...centralGroups, ...trailingGroups]
  }, [
    search,
    currentPage,
    registeredCommands,
    issueResults,
    monitorResults,
    datasetResults,
    savedSearchResults,
    tracesFallback,
    navigationCommands,
    projectCommands,
    globalCommands,
  ])

  const resetState = () => {
    setSearch("")
    setPageStack([])
    setSavedSearches([])
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) resetState()
  }

  // Cmd+K opens, or closes through handleOpenChange so closing via the hotkey resets the
  // query/page stack just like Esc or an outside click. ignoreInputs:false so it still fires
  // while a text input is focused. (Closing via setOpen directly would skip resetState, since
  // Radix only runs onOpenChange for its own dismissals, not external open-prop changes.)
  useHotkeys([
    {
      hotkey: "Mod+K",
      callback: () => (open ? handleOpenChange(false) : setOpen(true)),
      options: { ignoreInputs: false },
    },
  ])

  const popPage = () => {
    // Restore the query that was active on the level we're returning to.
    setSearch(savedSearches.at(-1) ?? "")
    setSavedSearches((saved) => saved.slice(0, -1))
    setPageStack((stack) => stack.slice(0, -1))
  }

  const execute = (command: PaletteCommand) => {
    if (command.kind === "parent") {
      // Remember this level's query so popping back restores it; the sub-page starts empty.
      setSavedSearches((saved) => [...saved, search])
      setPageStack((stack) => [...stack, command])
      setSearch("")
      return
    }
    handleOpenChange(false)
    void command.perform()
  }

  // Escape backs out one step (preventing Radix from closing): pop a sub-page, otherwise
  // clear a non-empty query, and only close the palette from an empty root.
  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    if (pageStack.length > 0) {
      event.preventDefault()
      popPage()
      return
    }
    if (search !== "") {
      event.preventDefault()
      setSearch("")
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      loop
      shouldFilter={false}
      onEscapeKeyDown={handleEscapeKeyDown}
    >
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
      />
      <CommandList>
        {issuesLoading ? (
          <CommandLoading>
            <Loader2Icon className="size-3.5 animate-spin" />
            Searching issues…
          </CommandLoading>
        ) : (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {groups.map((group) => (
          <CommandGroup key={group.key} heading={group.label}>
            {group.commands.map((command) => (
              <CommandItem key={command.id} value={command.id} onSelect={() => execute(command)}>
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
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-muted px-1 font-mono">esc</kbd>{" "}
          {currentPage ? "back" : search !== "" ? "clear" : "close"}
        </span>
      </CommandFooter>
    </CommandDialog>
  )
}
