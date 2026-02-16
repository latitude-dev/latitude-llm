ALTER TABLE spans ON CLUSTER default
  ADD INDEX IF NOT EXISTS idx_experiment_uuid experiment_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_parent_id parent_id TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_test_deployment_id test_deployment_id TYPE bloom_filter(0.01) GRANULARITY 1;

ALTER TABLE spans ON CLUSTER default MATERIALIZE INDEX idx_experiment_uuid;
ALTER TABLE spans ON CLUSTER default MATERIALIZE INDEX idx_parent_id;
ALTER TABLE spans ON CLUSTER default MATERIALIZE INDEX idx_test_deployment_id;
