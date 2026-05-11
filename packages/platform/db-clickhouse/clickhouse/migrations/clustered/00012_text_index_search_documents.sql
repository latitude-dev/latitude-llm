-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trace search documents — text index
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replaces ILIKE-substring lexical search with a text index. `splitByNonAlpha`
-- discards every non-alphanumeric ASCII byte as a separator, so JSON-shaped
-- inputs like `{"handOffToHuman":true}` and `{"handOffToHuman": true}` produce
-- the same token sequence — the whitespace asymmetry that caused LAT-562
-- cannot exist at the token layer. The `lower()` preprocessor lowercases at
-- index time so case-insensitive matching is free at query time.
--
-- Existing rows become searchable as `MATERIALIZE INDEX` completes. The legacy
-- `tokenbf_v1` and `ngrambf_v1` indexes stay in place; they are dropped in a
-- later migration once production traffic has run on the new path.

ALTER TABLE trace_search_documents ON CLUSTER default
    ADD INDEX IF NOT EXISTS idx_search_text_text(search_text)
    TYPE text(tokenizer = 'splitByNonAlpha', preprocessor = lower(search_text))
    GRANULARITY 1;

ALTER TABLE trace_search_documents ON CLUSTER default
    MATERIALIZE INDEX idx_search_text_text;

-- +goose Down

ALTER TABLE trace_search_documents ON CLUSTER default
    DROP INDEX IF EXISTS idx_search_text_text;
