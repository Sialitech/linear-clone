import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imageMarkdown, splitStorageImages, storageIdsInText } from "../src/lib/images.ts";

describe("storage images", () => {
  it("splits markdown around an image token", () => {
    const text = `before\n${imageMarkdown("shot.png", "https://example.convex.cloud/api/storage/kg2abc")} after`;
    const parts = splitStorageImages(text);
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[1]?.type, "image");
    if (parts[1]?.type === "image") {
      assert.equal(parts[1].storageId, "kg2abc");
      assert.equal(parts[1].alt, "shot.png");
    }
    assert.deepEqual(storageIdsInText(text), ["kg2abc"]);
  });
});
