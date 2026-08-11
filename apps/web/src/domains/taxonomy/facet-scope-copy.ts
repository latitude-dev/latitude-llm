/**
 * Why Topics covers a project's whole history while every other facet only
 * covers the sessions received since it was created: Topics clusters off the
 * embeddings every trace already gets at ingest, so it can read the whole
 * history for free. A facet instead needs an AI pass to extract its answer per
 * session, which only ever runs on sessions from the point the facet existed
 * onward — there is nothing to extract for sessions that predate it. Used by
 * the catalog's scope icon (the facet tree still shows the real date picker).
 * User-facing copy says "behavior group", never "facet" — that word only
 * appears here and in the domain layer (`TaxonomyFacet`, `facetId`).
 */
export const FACET_SCOPE_GLOBAL_TOOLTIP =
  "Topics tracks sessions across your project's entire history, from the very beginning."

export const FACET_SCOPE_WINDOWED_TOOLTIP = "This behavior group only tracks sessions received since it was created."
