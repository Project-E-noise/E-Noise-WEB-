-- When the occupant agreed to the privacy notice on the client registration
-- page. NULL = not recorded (accounts created before the notice existed).
ALTER TABLE occupants ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
