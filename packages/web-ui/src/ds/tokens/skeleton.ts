export const skeleton = {
  height: {
    h8: 'h-[8px]', // 8px
    h7: 'h-[10px]', // 10px
    h6: 'h-3', // 12px
    h5: 'h-3.5', // 14px
    h4: 'h-4', // 16px
    h3: 'h-5', // 20px
    h2: 'h-[26px]', // 26px
    h1: 'h-9', // 36px
  },
}

export type SkeletonHeight = keyof typeof skeleton.height
