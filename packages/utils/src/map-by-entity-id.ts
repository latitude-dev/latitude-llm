/**
 * Single pass: map each entity's `id` to a derived value.
 * Use with `useMemo` to avoid recomputing per-row in tables and lists.
 */
export function mapByEntityId<TEntity extends { readonly id: string }, TValue>(
  entities: readonly TEntity[],
  valueForEntity: (entity: TEntity) => TValue,
): ReadonlyMap<string, TValue> {
  const out = new Map<string, TValue>()
  for (const entity of entities) {
    out.set(entity.id, valueForEntity(entity))
  }
  return out
}
