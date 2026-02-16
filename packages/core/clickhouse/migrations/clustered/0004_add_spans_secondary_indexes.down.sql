ALTER TABLE spans ON CLUSTER default DROP INDEX IF EXISTS idx_test_deployment_id;
ALTER TABLE spans ON CLUSTER default DROP INDEX IF EXISTS idx_parent_id;
ALTER TABLE spans ON CLUSTER default DROP INDEX IF EXISTS idx_experiment_uuid;
