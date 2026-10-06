// Browsers throw one of these when a stale tab's dynamic import() resolves to a JS
// chunk hash that no longer exists after a deploy replaces the asset manifest.
const CHUNK_LOAD_ERROR_MESSAGE =
  /^(Importing a module script failed\.|Failed to fetch dynamically imported module|error loading dynamically imported module)/

export const isChunkLoadError = (error: unknown): boolean =>
  error instanceof Error && CHUNK_LOAD_ERROR_MESSAGE.test(error.message)

export const CHUNK_LOAD_RELOAD_SESSION_KEY = "lat:chunk-load-reload-attempted"
