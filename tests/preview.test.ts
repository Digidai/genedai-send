import { describe, it, expect } from "vitest";
import { previewDoc } from "../src/preview";
describe("Private email previews", () => {
  it("removes navigation and refresh while enforcing a restrictive CSP", () => {
    const html = previewDoc(
      '<meta http-equiv="refresh" content="0;url=https://example.com"><base href="https://evil.example"><a href="https://tracking.example">Read</a><svg><a xlink:href="https://tracking.example">SVG</a></svg>',
    );
    expect(html).not.toContain("href=");
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).not.toContain("<base");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("img-src data:");
  });
});
