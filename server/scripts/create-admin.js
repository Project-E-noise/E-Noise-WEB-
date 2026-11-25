// Creates a verified admin account directly in the database. This is the
// fallback for when the verification email can't be delivered (e.g. Brevo
// isn't set up yet).
//
//   PowerShell:
//     $env:DATABASE_URL = "<connection string>"
//     npm run admin:create
//     Remove-Item Env:DATABASE_URL
//
// - Reads DATABASE_URL from the environment ONLY. server/.env is not loaded,
//   so it can't write to a database you didn't choose on purpose. It shows
//   the target host and asks for confirmation first.
// - Asks for name, email and password. The password is not shown while you
//   type, and it is never printed or logged; only its bcrypt hash is stored.
// - If an admin with that email already exists (e.g. registered but never
//   verified), it offers to verify it and set the new password. That also
//   signs the account out everywhere (token_version + 1).
//
// Run it in PowerShell or cmd. Git Bash's terminal may not hide the password.
import readline from "readline";
import pg from "pg";
import { pathToFileURL } from "url";
import { pgConfig } from "../src/config/dbConfig.js";
import { hashPassword } from "../src/utils/passwords.js";
import * as check from "../src/utils/validate.js";

/**
 * Creates a verified admin, or verifies an existing one and sets its
 * password. Returns { action: "created" | "updated", id, disabled }.
 */
export async function createVerifiedAdmin(client, { fullName, email, password }) {
  const name = check.text(fullName, "Full name", { max: 100 });
  const address = check.email(email);
  const passwordHash = await hashPassword(check.password(password));

  const existing = await client.query("SELECT id, status FROM admins WHERE LOWER(email) = LOWER($1)", [address]);
  if (existing.rows.length) {
    // A DISABLED admin stays disabled: this script doesn't undo that decision.
    const { rows } = await client.query(
      `UPDATE admins
       SET password_hash = $2, is_verified = TRUE,
           status = CASE WHEN status = 'DISABLED' THEN 'DISABLED' ELSE 'VERIFIED' END,
           verification_token = NULL, verification_token_expires_at = NULL,
           token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
      [existing.rows[0].id, passwordHash]
    );
    return { action: "updated", id: rows[0].id, disabled: rows[0].status === "DISABLED" };
  }

  const { rows } = await client.query(
    `INSERT INTO admins (full_name, email, password_hash, is_verified, status)
     VALUES ($1, $2, $3, TRUE, 'VERIFIED')
     RETURNING id`,
    [name, address, passwordHash]
  );
  return { action: "created", id: rows[0].id, disabled: false };
}

// ---- Terminal prompts ------------------------------------------------------
// Lines are read through an async iterator so piped input works too. For a
// hidden answer, readline's echo of the typed characters is switched off
// (_writeToOutput is what readline uses to echo; muting it hides the input).
function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  let muted = false;
  rl._writeToOutput = text => {
    if (!muted) rl.output.write(text);
  };
  rl.on("SIGINT", () => {
    process.stdout.write("\nCancelled.\n");
    process.exit(130);
  });
  const lines = rl[Symbol.asyncIterator]();
  const next = async () => {
    const { value, done } = await lines.next();
    if (done) throw new Error("Input ended before all answers were given.");
    return value;
  };
  return {
    async ask(question) {
      process.stdout.write(question);
      return (await next()).trim();
    },
    async askHidden(question) {
      process.stdout.write(question);
      muted = true;
      try {
        return await next();
      } finally {
        muted = false;
        process.stdout.write("\n");
      }
    },
    close: () => rl.close()
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. In PowerShell: $env:DATABASE_URL = "<connection string>", then run this again.');
    process.exit(1);
  }
  const config = pgConfig(process.env.DATABASE_URL, process.env.NODE_ENV);
  const target = new URL(config.connectionString);
  const prompt = createPrompter();

  try {
    console.log(`Create a verified admin in database "${target.pathname.slice(1)}" on ${target.hostname}.`);
    if ((await prompt.ask("Is this the right database? (y/N) ")).toLowerCase() !== "y") {
      console.log("Cancelled. Nothing was changed.");
      return;
    }

    const fullName = await prompt.ask("Full name: ");
    const email = await prompt.ask("Email: ");
    const password = await prompt.askHidden("Password (8+ characters, not shown): ");
    const again = await prompt.askHidden("Password again: ");
    if (password !== again) throw new Error("The two passwords are different. Nothing was changed.");
    // Check the answers before touching the database.
    check.text(fullName, "Full name", { max: 100 });
    check.email(email);
    check.password(password);

    const client = new pg.Client(config);
    await client.connect();
    try {
      const exists = await client.query("SELECT 1 FROM admins WHERE LOWER(email) = LOWER($1)", [email.trim()]);
      if (exists.rows.length) {
        const answer = await prompt.ask("An admin with this email already exists. Verify it and set this password? (y/N) ");
        if (answer.toLowerCase() !== "y") {
          console.log("Cancelled. Nothing was changed.");
          return;
        }
      }
      const result = await createVerifiedAdmin(client, { fullName, email, password });
      if (result.action === "created") console.log(`Admin created and verified (id ${result.id}). Sign in at /login.`);
      else console.log(`Admin verified and password updated (id ${result.id}). Old sessions were signed out.`);
      if (result.disabled) console.log("Note: this admin is DISABLED and still can't sign in.");
    } finally {
      await client.end();
    }
  } finally {
    prompt.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    // err.message never contains the password (validation messages don't echo values).
    console.error(err.message);
    process.exit(1);
  });
}
