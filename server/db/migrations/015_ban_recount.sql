-- 015: lift a ban by recounting strikes.
-- When an occupant is banned, strikes_since moves to the ban start (strikes
-- reset). The previous value is kept here, so if a strike that led to the
-- ban is later dismissed, the server can recount that ban's strikes
-- (violations after ban_strikes_since, up to ban_started_at, inside the
-- retention window) and, below 3, lift the ban and restore strikes_since.
-- NULL = the ban was counted from the very first violation (or it predates
-- this migration).
ALTER TABLE occupants ADD COLUMN IF NOT EXISTS ban_strikes_since TIMESTAMPTZ;
