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
 *
 * Both tooltips name the other side of the contrast, not just their own scope,
 * since a user could land on either icon first and needs the same "Topics is
 * the one built-in exception" takeaway either way.
 */
export const FACET_SCOPE_GLOBAL_TOOLTIP =
  "Unlike the behavior groups you create, Topics is built in by default, covering your project's entire history from day one."

export const FACET_SCOPE_WINDOWED_TOOLTIP =
  "Unlike Topics, this behavior group only tracks sessions received since it was created."
