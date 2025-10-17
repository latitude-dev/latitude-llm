-- Custom SQL migration file, put you code below! --
-- Update evaluation_results table to copy provider_log_id values to evaluation_provider_log_id
UPDATE "latitude".evaluation_results 
SET evaluation_provider_log_id = provider_log_id 
WHERE provider_log_id IS NOT NULL;