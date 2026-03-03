export interface FakeWeaviateCollectionDefinition {
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface FakeWeaviateClientOptions {
  readonly ready?: boolean;
  readonly live?: boolean;
}

export interface FakeWeaviateCollectionsApi {
  exists: (name: string) => Promise<boolean>;
  create: (definition: FakeWeaviateCollectionDefinition) => Promise<void>;
}

export interface FakeWeaviateClient {
  readonly collections: FakeWeaviateCollectionsApi;
  isReady: () => Promise<boolean>;
  isLive: () => Promise<boolean>;
  setReady: (ready: boolean) => void;
  setLive: (live: boolean) => void;
  listCollectionNames: () => readonly string[];
  getCollection: (name: string) => FakeWeaviateCollectionDefinition | undefined;
}

export const createFakeWeaviateClient = (options: FakeWeaviateClientOptions = {}): FakeWeaviateClient => {
  let ready = options.ready ?? true;
  let live = options.live ?? true;
  const collections = new Map<string, FakeWeaviateCollectionDefinition>();

  return {
    collections: {
      exists: async (name: string) => collections.has(name),
      create: async (definition: FakeWeaviateCollectionDefinition) => {
        if (collections.has(definition.name)) {
          throw new Error(`Collection "${definition.name}" already exists`);
        }

        collections.set(definition.name, definition);
      },
    },
    isReady: async () => ready,
    isLive: async () => live,
    setReady: (nextReady: boolean) => {
      ready = nextReady;
    },
    setLive: (nextLive: boolean) => {
      live = nextLive;
    },
    listCollectionNames: () => Array.from(collections.keys()),
    getCollection: (name: string) => collections.get(name),
  };
};
