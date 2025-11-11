-- Custom SQL migration file, put your code below! --

-- Migrate existing experiments metadata from old schema to new schema
-- Old schema: { prompt, promptHash, parametersMap, datasetLabels, fromRow?, toRow?, count, simulationSettings? }
-- New schema: { prompt, promptHash, count, parametersSource: { source: 'dataset' | 'logs' | 'manual', ... }, simulationSettings? }

-- Migrate experiments WITH dataset_id to 'dataset' source
UPDATE latitude.experiments
SET metadata = jsonb_build_object(
  'prompt', metadata->>'prompt',
  'promptHash', metadata->>'promptHash',
  'count', (metadata->>'count')::int,
  'parametersSource', jsonb_build_object(
    'source', 'dataset',
    'datasetId', dataset_id,
    'fromRow', COALESCE((metadata->>'fromRow')::int, 0),
    'toRow', COALESCE((metadata->>'toRow')::int, 0),
    'datasetLabels', COALESCE(metadata->'datasetLabels', '{}'::jsonb),
    'parametersMap', COALESCE(metadata->'parametersMap', '{}'::jsonb)
  ),
  'simulationSettings', COALESCE(metadata->'simulationSettings', 'null'::jsonb)
)
WHERE dataset_id IS NOT NULL;

-- Migrate experiments WITHOUT dataset_id to 'manual' source
UPDATE latitude.experiments
SET metadata = jsonb_build_object(
  'prompt', metadata->>'prompt',
  'promptHash', metadata->>'promptHash',
  'count', (metadata->>'count')::int,
  'parametersSource', jsonb_build_object(
    'source', 'manual',
    'count', (metadata->>'count')::int,
    'parametersMap', COALESCE(metadata->'parametersMap', '{}'::jsonb)
  ),
  'simulationSettings', COALESCE(metadata->'simulationSettings', 'null'::jsonb)
)
WHERE dataset_id IS NULL;
