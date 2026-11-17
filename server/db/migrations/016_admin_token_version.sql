-- 016: admin session revocation.
-- Every admin JWT carries the admin's token_version ("tv" claim). Logging
-- out increments it, so every token issued before (on any device) stops
-- working at once, instead of staying valid until it expires.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
