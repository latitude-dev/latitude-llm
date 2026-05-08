-- +goose NO TRANSACTION
-- +goose Up

-- See clustered/00012 for the rationale.

ALTER TABLE trace_search_documents
    ADD INDEX IF NOT EXISTS idx_search_text_text(search_text)
    TYPE text(tokenizer = 'splitByNonAlpha', preprocessor = lower(search_text))
    GRANULARITY 1;

ALTER TABLE trace_search_documents
    MATERIALIZE INDEX idx_search_text_text;

-- +goose Down

ALTER TABLE trace_search_documents
    DROP INDEX IF EXISTS idx_search_text_text;
