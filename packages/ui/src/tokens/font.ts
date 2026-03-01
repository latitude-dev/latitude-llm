export const font = {
  size: {
    h8: "text-[8px] leading-[10px]",
    h7: "text-[10px] leading-4",
    h6: "text-xs leading-4",
    h5: "text-sm leading-5",
    h4: "text-base leading-6",
    h3: "text-xl leading-8",
    h2: "text-3xl leading-9",
    h1: "text-4xl leading-h1",
  },
  family: {
    sans: "font-sans",
    display: "font-display",
    mono: "font-mono",
  },
  weight: {
    light: "font-light",
    normal: "font-normal",
    medium: "font-medium",
    semibold: "font-semibold",
    bold: "font-bold",
  },
  spacing: {
    normal: "tracking-normal",
    wide: "tracking-wide",
  },
  align: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  },
};

export type FontFamily = keyof typeof font.family;
export type FontSize = keyof typeof font.size;
export type TextAlign = keyof typeof font.align;
export type FontWeight = keyof typeof font.weight;
export type FontSpacing = keyof typeof font.spacing;
