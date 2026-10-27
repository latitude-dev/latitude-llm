-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE trace_message_occurrences ON CLUSTER default
    MODIFY SETTING lightweight_mutation_projection_mode = 'rebuild';

-- +goose Down

ALTER TABLE trace_message_occurrences ON CLUSTER default
    RESET SETTING lightweight_mutation_projection_mode;
