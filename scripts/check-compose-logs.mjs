#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Capture logs in memory; never echo a potentially sensitive matching line.
const logs = process.argv.includes("--stdin")
  ? readFileSync(0, "utf8")
  : execFileSync(
      "docker",
      ["compose", "logs", "--no-color", "app", "migrate", "db"],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
assert.ok(logs.trim(), "Expected nonempty Compose logs to inspect");
for (const forbidden of [
  /4242[ -]?4242[ -]?4242[ -]?4242/,
  /4000[ -]?0000[ -]?0000[ -]?0002/,
  /4000[ -]?0000[ -]?0000[ -]?9995/,
  /QA Secret Cardholder/,
  /["'](?:cvc|cardholderName|expiry)["']\s*:/,
]) {
  assert.ok(
    !forbidden.test(logs),
    "Sensitive checkout data appeared in Compose logs",
  );
}
console.log(
  "PASS: Compose logs contain no smoke-card secrets or raw card payload keys",
);
