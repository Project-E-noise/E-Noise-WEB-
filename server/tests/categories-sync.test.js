// One source of truth for the category strings: the server constants, the
// dashboard constants, the SQL CHECK constraints (migration 014) and the
// ML service's CATEGORIES must list exactly the same strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ML_CATEGORIES, VIOLATION_CATEGORIES, INCIDENT_STATUSES, FILTER_REASONS } from "../src/data/constants.js";

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

// Extracts the string list of `export const NAME = [...]` from JS source.
function jsList(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  assert.ok(match, `${name} not found`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

// Extracts the quoted strings inside `CHECK (... IN (...))` for a column.
function sqlList(source, column) {
  const pattern = new RegExp(`${column} IS NULL OR ${column} IN \\(([^)]*)\\)|${column} IN \\(([^)]*)\\)`, "g");
  const lists = [...source.matchAll(pattern)].map(m => [...(m[1] ?? m[2]).matchAll(/'([^']+)'/g)].map(x => x[1]));
  assert.ok(lists.length, `no CHECK for ${column}`);
  return lists;
}

test("category strings match across server, dashboard, SQL and the ML service", () => {
  const dashboard = read("../../capstone/src/constants.js");
  assert.deepEqual(jsList(dashboard, "ML_CATEGORIES"), ML_CATEGORIES);
  assert.deepEqual(jsList(dashboard, "VIOLATION_CATEGORIES"), VIOLATION_CATEGORIES);
  assert.deepEqual(jsList(dashboard, "INCIDENT_STATUSES"), INCIDENT_STATUSES);

  const sql = read("../db/migrations/014_violation_gating.sql");
  for (const column of ["category", "classification"]) {
    for (const list of sqlList(sql, column)) assert.deepEqual(list, ML_CATEGORIES, `SQL CHECK on ${column}`);
  }
  assert.deepEqual(sqlList(sql, "status")[0], INCIDENT_STATUSES);
  assert.deepEqual(sqlList(sql, "filter_reason")[0], FILTER_REASONS);

  const python = read("../../ml-service/category_mapping.py");
  const match = python.match(/^CATEGORIES = \[([^\]]*)\]/m);
  assert.ok(match, "CATEGORIES not found in category_mapping.py");
  assert.deepEqual([...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]), ML_CATEGORIES);
});

test("every violation category is a real category", () => {
  for (const c of VIOLATION_CATEGORIES) assert.ok(ML_CATEGORIES.includes(c), c);
});
