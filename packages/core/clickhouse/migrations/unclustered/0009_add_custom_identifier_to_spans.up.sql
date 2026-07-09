ALTER TABLE spans
  ADD COLUMN IF NOT EXISTS custom_identifier Nullable(String) AFTER source;
