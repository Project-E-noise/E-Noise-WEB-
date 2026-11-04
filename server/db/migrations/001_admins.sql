-- Admin accounts. One row per registered administrator.
CREATE TABLE IF NOT EXISTS admins (
  id                              SERIAL PRIMARY KEY,
  full_name                       VARCHAR(255) NOT NULL,
  email                           VARCHAR(255) NOT NULL UNIQUE,
  password_hash                   VARCHAR(255) NOT NULL,
  is_verified                     BOOLEAN NOT NULL DEFAULT FALSE,
  status                          VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED'
                                     CHECK (status IN ('UNVERIFIED', 'VERIFIED', 'DISABLED')),
  verification_token              VARCHAR(255),
  verification_token_expires_at   TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admins_verification_token ON admins (verification_token);
