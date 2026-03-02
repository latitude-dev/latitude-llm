export const zIndex = {
  none: "z-0",
  auto: "z-auto",
  modal: "z-50",
  popover: "z-[60]",
  dropdown: "z-[65]",
  tooltip: "z-[70]",
}

export type ZIndex = keyof typeof zIndex
