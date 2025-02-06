export const font = {
  size: {
    h8: 'text-[8px] leading-[10px]', // 8px/10px
    h7: 'text-[10px] leading-4', // 10px/16px
    h6: 'text-xs leading-4', // 12px/16px
    h5: 'text-sm leading-5', // 14px/20px
    h4: 'text-base leading-6', // 16px/24px
    h3: 'text-xl leading-8', // 20px/32px
    h2: 'text-h2 leading-10', // 26px/40px
    h1: 'text-4xl leading-h1 ', // 36px/48px
  },
  family: {
    sans: 'font-sans',
    mono: 'font-mono',
  },
  weight: {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  },
  spacing: {
    normal: 'tracking-normal',
    wide: 'tracking-wide',
  },
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
  height: {
    h8: 'leading-[10px]',
    h7: 'leading-4',
    h6: 'leading-4',
    h5: 'leading-5',
    h4: 'leading-6',
    h3: 'leading-8',
    h2: 'leading-10',
    h1: 'leading-h1',
  },
}

export type FontFamily = keyof typeof font.family
export type FontSize = keyof typeof font.size
export type TextAlign = keyof typeof font.align
export type FontWeight = keyof typeof font.weight
export type FontSpacing = keyof typeof font.spacing
export type LineHeight = keyof typeof font.height
