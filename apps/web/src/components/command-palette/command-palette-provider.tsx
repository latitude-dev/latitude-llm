import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useState } from "react"
import { CreateOrganizationModal } from "../../routes/_authenticated/-components/create-organization-modal.tsx"
import { CreateProjectModal } from "../../routes/_authenticated/-components/create-project-modal.tsx"
import type { PaletteCommand } from "./types.ts"

interface CommandPaletteContextValue {
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
  readonly toggle: () => void
  /** Global actions that open a modal owned by this provider (reachable from anywhere). */
  readonly openCreateProject: () => void
  readonly openCreateOrganization: () => void
  /** Contextual commands contributed by mounted views, flattened in registration order. */
  readonly registeredCommands: readonly PaletteCommand[]
  readonly register: (id: string, commands: readonly PaletteCommand[]) => void
  readonly unregister: (id: string) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

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

  const registeredCommands = useMemo(() => Array.from(registry.values()).flat(), [registry])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((prev) => !prev),
      openCreateProject: () => setCreateProjectOpen(true),
      openCreateOrganization: () => setCreateOrgOpen(true),
      registeredCommands,
      register,
      unregister,
    }),
    [open, registeredCommands, register, unregister],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CreateProjectModal open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} />
      <CreateOrganizationModal open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error("useCommandPalette must be used within a CommandPaletteProvider")
  return ctx
}

/**
 * Contribute contextual commands to the palette while the calling component is mounted.
 * Pass a memoized `commands` array; commands typically capture the current entity and reuse
 * the same handlers the view's buttons call. Registration is retracted automatically on
 * unmount (e.g. when an entity drawer closes).
 */
export function useRegisterCommands(commands: readonly PaletteCommand[]): void {
  const id = useId()
  const { register, unregister } = useCommandPalette()
  useEffect(() => {
    register(id, commands)
    return () => unregister(id)
  }, [id, commands, register, unregister])
}
