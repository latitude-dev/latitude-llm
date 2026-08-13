import { cn, Input, Select } from "@repo/ui"

export type SandboxProjectMode = "existing" | "new"

const MODE_OPTIONS: readonly { readonly id: SandboxProjectMode; readonly label: string }[] = [
  { id: "existing", label: "Production project" },
  { id: "new", label: "New project" },
]

export interface ProductionProjectOption {
  readonly id: string
  readonly name: string
  readonly disabled?: boolean
}

/**
 * Shared project picker for the sandbox modals. An explicit segmented toggle —
 * "Production project" (attach → linked sandbox project) vs "New project"
 * (sandbox-only) — instead of smuggling "create new" in as a dropdown option.
 * Fully controlled; the parent owns the state and the submit action.
 *
 * When `allowProduction` is false (every production project is already attached)
 * the toggle and the production picker collapse away, leaving just the
 * sandbox-only name field — there's nothing left to attach.
 */
export function SandboxProjectChooser({
  mode,
  onModeChange,
  productionProjects,
  productionProjectId,
  onProductionProjectChange,
  newName,
  onNewNameChange,
  loading,
  allowProduction = true,
}: {
  readonly mode: SandboxProjectMode
  readonly onModeChange: (mode: SandboxProjectMode) => void
  readonly productionProjects: readonly ProductionProjectOption[]
  readonly productionProjectId: string
  readonly onProductionProjectChange: (id: string) => void
  readonly newName: string
  readonly onNewNameChange: (name: string) => void
  readonly loading?: boolean
  readonly allowProduction?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {allowProduction ? (
        <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-secondary p-0.5">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onModeChange(option.id)}
              className={cn("rounded-md px-3 py-1 text-sm font-medium transition-colors", {
                "bg-background text-foreground shadow-sm": mode === option.id,
                "text-muted-foreground hover:text-foreground": mode !== option.id,
              })}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {allowProduction && mode === "existing" ? (
        <Select
          name="sandbox-production-project"
          label="Project to debug"
          description="Reuses a production project's identifier so your dev traces land in the sandbox. Production stays untouched."
          placeholder="Select a production project"
          options={productionProjects.map((p) => ({
            label: p.name,
            value: p.id,
            ...(p.disabled ? { disabled: true } : {}),
          }))}
          value={productionProjectId}
          loading={loading ?? false}
          onChange={(value) => onProductionProjectChange(String(value))}
        />
      ) : (
        <Input
          required
          type="text"
          label="New project name"
          description="A sandbox-only project with no production counterpart. That's fine; create whatever you need to experiment."
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          placeholder="My sandbox project"
        />
      )}
    </div>
  )
}
