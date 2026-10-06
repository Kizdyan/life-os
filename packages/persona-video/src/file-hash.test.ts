import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashFileSha256 } from "./file-hash";
import { createFixtureDirectory } from "../test/fixture";

describe("hashFileSha256", () => {
  it("returns the SHA-256 digest of a file", async () => {
    const directory = await createFixtureDirectory();
    const path = join(directory, "hash-source.txt");
    await writeFile(path, "abc", "utf8");

    await expect(hashFileSha256(path)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
