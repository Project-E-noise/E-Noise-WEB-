-- Phase 7: throttles how often the backend asks a node for a fresh audio
-- clip to classify. Without this, a sustained loud streak would trigger an
-- audio-request on every single telemetry message (once per second).
ALTER TABLE sensor_status ADD COLUMN IF NOT EXISTS last_audio_requested_at TIMESTAMPTZ;
