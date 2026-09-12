#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const queries = [...readme.matchAll(/```sql\s*\n([\s\S]*?)```/g)].map(
  (match) => match[1],
);
assert.ok(
  queries.length >= 5,
  "README must retain the documented analytics queries",
);
const db = new PrismaClient();
try {
  for (const [index, sql] of queries.entries()) {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const rows = await tx.$queryRawUnsafe(sql);
      assert.ok(
        Array.isArray(rows),
        `README SQL ${index + 1} must return rows`,
      );
    });
  }
  console.log(
    `PASS: ${queries.length} README analytics queries executed read-only`,
  );
} finally {
  await db.$disconnect();
}
