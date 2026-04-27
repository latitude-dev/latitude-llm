// Feature-grouped barrel. Each folder under `src/` owns one backoffice
// feature (entities + ports + use-cases). Add a new folder per feature and
// re-export its public surface below.
export * from "./search/index.ts"
export * from "./users/index.ts"
