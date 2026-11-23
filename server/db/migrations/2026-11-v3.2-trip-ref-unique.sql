-- Adds normalized ref_id and composite unique index on (org_id, ref_id_normalized)
-- Run npm run migrate-trip-ref-id to check for existing duplicates before applying.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS ref_id_normalized VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    GENERATED ALWAYS AS (NULLIF(UPPER(TRIM(ref_id)), '')) STORED;

ALTER TABLE trips
  ADD UNIQUE INDEX IF NOT EXISTS uq_trips_org_ref_normalized (org_id, ref_id_normalized);
