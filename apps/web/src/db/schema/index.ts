// NOTE: We don't use `$/` alias imports in this folder to use it
// in docker/drizzle-studio.Dockerfile it simplify things
export { latitudeSchema } from './db-schema'
export { promptVersions, type PromptVersion } from './prompts/promptVersions'
export {
  promptSnapshots,
  promptSnapshotsRelations,
  type PromptSnapshot,
} from './prompts/promptSnaptshots'
export { commits, commitRelations, type Commit } from './prompts/commits'
