import { createContext, type ReactNode, useContext, useMemo, useState } from "react"
import { CreateOrganizationModal } from "../../routes/_authenticated/-components/create-organization-modal.tsx"
import { CreateProjectModal } from "../../routes/_authenticated/-components/create-project-modal.tsx"

interface CommandPaletteContextValue {
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
  readonly toggle: () => void
  /** Global actions that open a modal owned by this provider (reachable from anywhere). */
  readonly openCreateProject: () => void
  readonly openCreateOrganization: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

/**
 * Holds the command palette's open state and owns the global "create" modals so palette
 * actions can open them regardless of the current route. Mounted once in the authenticated
 * layout, above every page.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((prev) => !prev),
      openCreateProject: () => setCreateProjectOpen(true),
      openCreateOrganization: () => setCreateOrgOpen(true),
    }),
    [open],
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
