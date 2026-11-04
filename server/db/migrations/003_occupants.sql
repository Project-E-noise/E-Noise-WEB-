-- People who can be assigned to a table; tracks the 3-violation ban rule.
CREATE TABLE IF NOT EXISTS occupants (
  id               SERIAL PRIMARY KEY,
  full_name        VARCHAR(255) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'BANNED')),
  ban_started_at   TIMESTAMPTZ,
  ban_until        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
