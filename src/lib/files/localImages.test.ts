import { describe, expect, it } from "vitest";
import { isRelativeImageSource, MAX_LOCAL_IMAGE_COUNT } from "./localImages";

describe("local image source filtering", () => {
  it("accepts document-relative paths", () => {
    expect(isRelativeImageSource("images/figure.png")).toBe(true);
    expect(isRelativeImageSource("images/../figure.png?raw=1#preview")).toBe(true);
  });

  it("rejects network, embedded, fragment and empty sources", () => {
    for (const source of [
      "",
      "  ",
      "https://example.com/image.png",
      "//example.com/image.png",
      "/tmp/image.png",
      "\\\\server\\image.png",
      "C:\\image.png",
      "data:image/png;base64,AAAA",
      "file:///tmp/image.png",
      "#figure",
    ]) {
      expect(isRelativeImageSource(source)).toBe(false);
    }
  });

  it("keeps the frontend count limit synchronized with the native boundary", () => {
    expect(MAX_LOCAL_IMAGE_COUNT).toBe(32);
  });
});
