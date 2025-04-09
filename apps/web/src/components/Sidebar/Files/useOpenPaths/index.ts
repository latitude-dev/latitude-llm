import { create } from 'zustand'

type OpenPathsState = {
  openPaths: { [key: string]: boolean }
  togglePath: (path: string) => void
  isOpen: (path: string) => boolean
  reset: () => void
}

export const useOpenPaths = create<OpenPathsState>((set, get) => ({
  openPaths: {},
  reset: () => {
    set({ openPaths: {} })
  },
  isOpen: (path: string) => {
    const state = get()
    const paths = state.openPaths
    return !!paths[path]
  },
  togglePath: (path: string) => {
    set((state) => {
      const paths = state.openPaths
      const isPathOpen = paths[path]

      if (!isPathOpen) {
        const segments = path.split('/')
        const newPaths = segments.reduce(
          (acc, _, idx) => {
            const newPath = segments.slice(0, idx + 1).join('/')
            return { ...acc, [newPath]: true }
          },
          {} as { [key: string]: boolean },
        )

        return {
          openPaths: { ...paths, ...newPaths },
        }
      }

      return {
        openPaths: {
          ...state.openPaths,
          [path]: false,
        },
      }
    })
  },
}))
