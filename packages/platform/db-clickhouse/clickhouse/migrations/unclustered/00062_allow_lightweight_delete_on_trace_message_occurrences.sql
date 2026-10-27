-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE trace_message_occurrences
    MODIFY SETTING lightweight_mutation_projection_mode = 'rebuild';

-- +goose Down

ALTER TABLE trace_message_occurrences
    RESET SETTING lightweight_mutation_projection_mode;
