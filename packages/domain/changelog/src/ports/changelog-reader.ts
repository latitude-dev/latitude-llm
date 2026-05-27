import { Context, type Effect } from "effect"
import type { ChangelogEntry } from "../entities/changelog-entry.ts"
import type { ChangelogReadError } from "../errors.ts"

export interface ChangelogReaderShape {
  list: () => Effect.Effect<readonly ChangelogEntry[], ChangelogReadError>
}

/**
 * Port for reading changelog entries from the upstream CMS.
 *
 * The live adapter lives in `@platform/changelog-framer`. Entries are returned
 * in no guaranteed order — the use-case sorts by `publishedAt`.
 */
export class ChangelogReader extends Context.Service<ChangelogReader, ChangelogReaderShape>()(
  "@domain/changelog/ChangelogReader",
) {}
