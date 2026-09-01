import { createContext, type ReactNode, useContext } from "react"

/**
 * Portal target for filter popovers (the multi-select combobox). Default `null`
 * means portal to `document.body`, correct on full pages like Sessions. Inside a
 * modal, body-portaled content sits outside the dialog's focus scope and becomes
 * non-interactive, so the modal provides its own content element here to mount the
 * popovers within the dialog.
 */
const FilterPortalContainerContext = createContext<HTMLElement | null>(null)

export function FilterPortalContainerProvider({
  container,
  children,
}: {
  readonly container: HTMLElement | null
  readonly children: ReactNode
}) {
  return <FilterPortalContainerContext.Provider value={container}>{children}</FilterPortalContainerContext.Provider>
}

export const useFilterPortalContainer = (): HTMLElement | null => useContext(FilterPortalContainerContext)
