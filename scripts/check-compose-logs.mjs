#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Capture logs in memory; never echo a potentially sensitive matching line.
const logs = execFileSync('docker', ['compose', 'logs', '--no-color', 'app', 'migrate', 'db'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
for (const forbidden of [/4242[ -]?4242[ -]?4242[ -]?4242/, /4000[ -]?0000[ -]?0000[ -]?0002/, /4000[ -]?0000[ -]?0000[ -]?9995/, /QA Secret Cardholder/, /["'](?:cvc|cardholderName|expiry)["']\s*:/]) {
  assert.ok(!forbidden.test(logs), 'Sensitive checkout data appeared in Compose logs');
}
console.log('PASS: Compose logs contain no smoke-card secrets or raw card payload keys');
