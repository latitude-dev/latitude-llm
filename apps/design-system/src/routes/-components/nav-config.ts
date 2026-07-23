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
      { label: "About", to: "/", description: "Overview of @repo/ui" },
      { label: "Brand", to: "/brand", description: "Logo and brand guidelines" },
    ],
  },
  {
    label: "Product",
    items: [
      { label: "Colors", to: "/colors" },
      { label: "Typography", to: "/typography" },
      { label: "Spacing", to: "/spacing" },
      { label: "Shadows", to: "/shadows" },
      { label: "Icons", to: "/icons" },
    ],
  },
  {
    label: "Components",
    items: [
      { label: "Agent textarea", to: "/agent-textarea" },
      { label: "Alert", to: "/alert" },
      { label: "Avatar", to: "/avatar" },
      { label: "Badge", to: "/badge" },
      { label: "Button", to: "/button" },
      { label: "Chat", to: "/chat" },
      { label: "Checkbox", to: "/checkbox" },
      { label: "Code diff", to: "/code-diff" },
      { label: "Copy button", to: "/copy-button" },
      { label: "Date range picker", to: "/date-range-picker" },
      { label: "Forms", to: "/forms" },
      { label: "Infinite table", to: "/infinite-table" },
      { label: "Master detail", to: "/master-detail" },
      { label: "Rich text editor", to: "/rich-text-editor" },
      { label: "Status", to: "/status" },
      { label: "Charts", to: "/charts" },
    ],
  },
]
