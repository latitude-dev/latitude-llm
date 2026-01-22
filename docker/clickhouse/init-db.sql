-- Create development and test databases
-- User 'latitude' is created automatically via CLICKHOUSE_USER/CLICKHOUSE_PASSWORD env vars
CREATE DATABASE IF NOT EXISTS latitude_analytics_development;
CREATE DATABASE IF NOT EXISTS latitude_analytics_test;
