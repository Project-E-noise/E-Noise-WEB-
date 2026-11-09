// Builds the `pg` connection settings from DATABASE_URL. Shared by the API
// (config/db.js), the migration script and the seed script so they all
// connect the same way.
//
// SSL: hosted Postgres (Neon) needs SSL. We turn it on when the URL asks
// for it (?sslmode=require) or when NODE_ENV=production and the database
// is not on localhost. The certificate is still verified.

function wantsSsl(url, nodeEnv) {
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === "disable") return false;
  if (sslmode) return true;
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  return nodeEnv === "production" && !isLocal;
}

export function pgConfig(databaseUrl = process.env.DATABASE_URL, nodeEnv = process.env.NODE_ENV) {
  if (!databaseUrl) return {};

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Not a URL we can parse; hand it to pg unchanged.
    return { connectionString: databaseUrl };
  }

  const ssl = wantsSsl(url, nodeEnv);
  // pg prints a warning for sslmode=require, so we remove it from the URL
  // and pass the SSL setting directly instead.
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");

  return {
    connectionString: url.toString(),
    ssl: ssl ? { rejectUnauthorized: true } : false
  };
}
