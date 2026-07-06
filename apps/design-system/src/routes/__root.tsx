import { createRootRoute, Outlet } from "@tanstack/react-router"
import { DesignSystemShell } from "./-components/design-system-shell.tsx"

export const Route = createRootRoute({
  component: () => (
    <DesignSystemShell>
      <Outlet />
    </DesignSystemShell>
  ),
})
