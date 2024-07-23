import { create } from 'zustand'

type OpenPathsState = {
  openPaths: string[]
  togglePath: (path: string) => void
}

function checkIsPathOrDescendant(basePath: string, path: string) {
  if (basePath === '' && path !== '') return true

  return path.startsWith(`${basePath}/`) || path === basePath
}

export const useOpenPaths = create<OpenPathsState>((set) => ({
  openPaths: [''],
  togglePath: (path: string) => {
    set((state) => {
      const isPathOpen = state.openPaths.includes(path)
      if (!isPathOpen) {
        const segments = path.split('/')
        const newPaths = segments.map((_, idx) =>
          segments.slice(0, idx + 1).join('/'),
        )

        return {
          openPaths: [...state.openPaths, ...newPaths],
        }
      } else {
        const filteredPaths = state.openPaths.filter(
          (p) => !checkIsPathOrDescendant(path, p),
        )

        return {
          openPaths: filteredPaths,
        }
      }
    })
  },
}))
