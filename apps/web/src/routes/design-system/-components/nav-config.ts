type DesignSystemNavItem = {
  label: string
  to: string
  description?: string
}

type DesignSystemNavSection = {
  label: string
  items: DesignSystemNavItem[]
}

export const DESIGN_SYSTEM_NAV: DesignSystemNavSection[] = [
  {
    label: "General",
    items: [
      { label: "About", to: "/design-system", description: "Overview of @repo/ui" },
      { label: "Brand", to: "/design-system/brand", description: "Logo and brand guidelines" },
    ],
  },
  {
    label: "Product",
    items: [
      { label: "Colors", to: "/design-system/colors" },
      { label: "Typography", to: "/design-system/typography" },
      { label: "Spacing", to: "/design-system/spacing" },
      { label: "Shadows", to: "/design-system/shadows" },
      { label: "Icons", to: "/design-system/icons" },
    ],
  },
  {
    label: "Components",
    items: [
      { label: "Alert", to: "/design-system/alert" },
      { label: "Avatar", to: "/design-system/avatar" },
      { label: "Badge", to: "/design-system/badge" },
      { label: "Button", to: "/design-system/button" },
      { label: "Chat", to: "/design-system/chat" },
      { label: "Checkbox", to: "/design-system/checkbox" },
      { label: "Copy button", to: "/design-system/copy-button" },
      { label: "Date range picker", to: "/design-system/date-range-picker" },
      { label: "Forms", to: "/design-system/forms" },
      { label: "Infinite table", to: "/design-system/infinite-table" },
      { label: "Rich text editor", to: "/design-system/rich-text-editor" },
      { label: "Status", to: "/design-system/status" },
      { label: "Charts", to: "/design-system/charts" },
    ],
  },
]
