import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { materializeImages } from "../convex/lib/materializeImages.ts";

describe("materializeImages", () => {
  it("replaces a data url and appends an extra image", async () => {
    const stored: string[] = [];
    const text = await materializeImages(
      "See ![shot](data:image/png;base64,YQ==)",
      [{ name: "extra.png", contentType: "image/png", data: "Yg==" }],
      async (file) => {
        stored.push(`${file.contentType}:${file.bytes.length}`);
        return `https://example.convex.cloud/api/storage/${stored.length}`;
      },
    );
    assert.equal(text, "See ![shot](https://example.convex.cloud/api/storage/1)\n\n![extra.png](https://example.convex.cloud/api/storage/2)");
    assert.deepEqual(stored, ["image/png:1", "image/png:1"]);
  });
});
