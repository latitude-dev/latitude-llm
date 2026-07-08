import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useState } from "react"
import { CreateOrganizationModal } from "../../routes/_authenticated/-components/create-organization-modal.tsx"
import { CreateProjectModal } from "../../routes/_authenticated/-components/create-project-modal.tsx"
import type { PaletteCommand } from "./types.ts"

/**
 * The palette context is split in two on purpose:
 *
 * - **Actions** is referentially stable for the lifetime of the provider (`register`,
 *   `unregister`, open/create handlers). Command contributors subscribe to *only* this, so a
 *   registration updating the registry can never re-render them — which is what prevents an
 *   infinite "register → setState → re-render → register" loop when a contributor's `commands`
 *   array isn't perfectly memoized (e.g. `useParamState` setters aren't stable).
 * - **State** (`open`, `registeredCommands`) is volatile and consumed only by the palette UI.
 */
interface CommandPaletteActions {
  readonly setOpen: (open: boolean) => void
  readonly openCreateProject: () => void
  readonly openCreateOrganization: () => void
  readonly register: (id: string, commands: readonly PaletteCommand[]) => void
  readonly unregister: (id: string) => void
  /** The in-flight/last agent chat session, kept outside the palette's per-open reset so closing and
   * reopening the palette resumes the same conversation. */
  readonly setActiveAgentSessionId: (sessionId: string | null) => void
}

interface CommandPaletteState {
  readonly open: boolean
  readonly registeredCommands: readonly PaletteCommand[]
  readonly activeAgentSessionId: string | null
}

const CommandPaletteActionsContext = createContext<CommandPaletteActions | null>(null)
const CommandPaletteStateContext = createContext<CommandPaletteState | null>(null)

/**
 * Holds the command palette's open state, the contextual-command registry, and the global
 * "create" modals so palette actions can open them regardless of the current route. Mounted
 * once in the authenticated layout, above every page.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [registry, setRegistry] = useState<ReadonlyMap<string, readonly PaletteCommand[]>>(() => new Map())
  const [activeAgentSessionId, setActiveAgentSessionId] = useState<string | null>(null)

  const register = useCallback((id: string, commands: readonly PaletteCommand[]) => {
    setRegistry((prev) => {
      const next = new Map(prev)
      next.set(id, commands)
      return next
    })
  }, [])

  const unregister = useCallback((id: string) => {
    setRegistry((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Stable for the provider's lifetime — the state setters are stable, so this object never
  // changes identity and never re-renders its consumers.
  const actions = useMemo<CommandPaletteActions>(
    () => ({
      setOpen,
      openCreateProject: () => setCreateProjectOpen(true),
      openCreateOrganization: () => setCreateOrgOpen(true),
      register,
      unregister,
      setActiveAgentSessionId,
    }),
    [register, unregister],
  )

  const registeredCommands = useMemo(() => Array.from(registry.values()).flat(), [registry])
  const state = useMemo<CommandPaletteState>(
    () => ({ open, registeredCommands, activeAgentSessionId }),
    [open, registeredCommands, activeAgentSessionId],
  )

  return (
    <CommandPaletteActionsContext.Provider value={actions}>
      <CommandPaletteStateContext.Provider value={state}>
        {children}
        <CreateProjectModal open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} />
        <CreateOrganizationModal open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      </CommandPaletteStateContext.Provider>
    </CommandPaletteActionsContext.Provider>
  )
}

/** Stable palette actions (open/toggle/create + registry mutators). Safe to use anywhere. */
export function useCommandPalette(): CommandPaletteActions {
  const ctx = useContext(CommandPaletteActionsContext)
  if (!ctx) throw new Error("useCommandPalette must be used within a CommandPaletteProvider")
  return ctx
}

/** Volatile palette state (open flag + contributed commands). Consumed by the palette UI. */
export function useCommandPaletteState(): CommandPaletteState {
  const ctx = useContext(CommandPaletteStateContext)
  if (!ctx) throw new Error("useCommandPaletteState must be used within a CommandPaletteProvider")
  return ctx
}

/**
 * Contribute contextual commands to the palette while the calling component is mounted.
 * Pass a memoized `commands` array; commands typically capture the current entity and reuse
 * the same handlers the view's buttons call. Registration is retracted automatically on
 * unmount (e.g. when an entity drawer closes).
 *
 * Reads only the stable actions context, so a registration re-render of the palette never
 * feeds back into the contributing component.
 *
 * Throws when no provider is mounted — only render command contributors inside
 * the authenticated tree. Shells without a palette (the sandbox) must gate the
 * contributor out at the call site rather than calling this without a provider.
 */
export function useRegisterCommands(commands: readonly PaletteCommand[]): void {
  const id = useId()
  const { register, unregister } = useCommandPalette()
  useEffect(() => {
    register(id, commands)
    return () => unregister(id)
  }, [id, commands, register, unregister])
}
