import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const require = createRequire(import.meta.url);
const prismaRequire = createRequire(require.resolve("prisma/config"));
const configRequire = createRequire(prismaRequire.resolve("@prisma/config"));

describe("Prisma config security override", () => {
  it("merges cyclic records with the patched dependency used by Prisma", () => {
    const mergeModule: unknown = configRequire("deepmerge-ts");
    const { deepmerge } = z
      .object({
        deepmerge: z.function({
          input: [z.unknown(), z.unknown()],
          output: z.unknown(),
        }),
      })
      .parse(mergeModule);
    const left: { self?: unknown; schema: string } = {
      schema: "schema.prisma",
    };
    const right: { self?: unknown; migrations: { path: string } } = {
      migrations: { path: "migrations" },
    };
    left.self = left;
    right.self = right;
    expect(() => deepmerge(left, right)).not.toThrow();
    expect(
      deepmerge({ nested: { enabled: true } }, { nested: { count: 2 } }),
    ).toEqual({ nested: { enabled: true, count: 2 } });
  });

  it("loads schema and migration paths through the real Prisma config loader", async () => {
    const directory = mkdtempSync(join(tmpdir(), "chachat-prisma-config-"));
    const configPath = join(directory, "prisma.config.mjs");
    try {
      writeFileSync(
        configPath,
        `export default ${JSON.stringify({
          schema: resolve("prisma/schema.prisma"),
          migrations: { path: resolve("prisma/migrations") },
        })};\n`,
      );
      const loader: unknown = prismaRequire("@prisma/config");
      const { loadConfigFromFile } = z
        .object({
          loadConfigFromFile: z.function({
            input: [
              z.object({ configRoot: z.string(), configFile: z.string() }),
            ],
            output: z.promise(z.unknown()),
          }),
        })
        .parse(loader);
      const loaded = await loadConfigFromFile({
        configRoot: directory,
        configFile: configPath,
      });
      expect(loaded).toMatchObject({
        config: {
          schema: resolve("prisma/schema.prisma"),
          migrations: { path: resolve("prisma/migrations") },
        },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20000);
});
