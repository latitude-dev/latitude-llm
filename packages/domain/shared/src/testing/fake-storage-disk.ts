import type { StorageDiskPort } from "../storage.ts"

export interface FakeStorageDiskState {
  readonly written: { key: string; contents: string | Uint8Array }[]
  readonly deleted: string[]
}

export const createFakeStorageDisk = (overrides?: Partial<StorageDiskPort>) => {
  const written: FakeStorageDiskState["written"] = []
  const deleted: FakeStorageDiskState["deleted"] = []

  const disk: StorageDiskPort = {
    put: async (key, contents) => {
      written.push({ key, contents })
    },
    putStream: async () => {},
    get: async () => "",
    getBytes: async () => new Uint8Array(),
    getStream: async () => new ReadableStream(),
    delete: async (key) => {
      deleted.push(key)
    },
    getSignedUrl: async () => "",
    ...overrides,
  }

  return { disk, written, deleted }
}
