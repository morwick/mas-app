-- ============================================================================
-- Migration 06: Realtime publication
-- Customer tracking page subscribes to jobs + job_photos by share_token; admin
-- dashboard subscribes to units + jobs.
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE units;
ALTER PUBLICATION supabase_realtime ADD TABLE job_photos;
