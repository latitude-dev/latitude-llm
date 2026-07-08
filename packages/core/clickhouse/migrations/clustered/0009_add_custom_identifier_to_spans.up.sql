ALTER TABLE spans ON CLUSTER default
  ADD COLUMN IF NOT EXISTS custom_identifier Nullable(String) AFTER source;
