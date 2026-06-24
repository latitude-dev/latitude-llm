import { createFileRoute, Outlet } from "@tanstack/react-router"
import { DesignSystemShell } from "./-components/design-system-shell.tsx"

export const Route = createFileRoute("/design-system")({
  component: DesignSystemLayout,
})

function DesignSystemLayout() {
  return (
    <DesignSystemShell>
      <Outlet />
    </DesignSystemShell>
  )
}
