import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { sniffImageType, IMAGE_EXTENSIONS } from "./admin-catalog-image";
import { securityHeadersFor } from "./security-headers";
import { assuranceLevelOf } from "./admin-mfa";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("product image type detection (#5/#6)", () => {
  test("accepts real JPEG, PNG and WebP signatures", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  test("rejects SVG, GIF, HTML and empty files", () => {
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
  test("RIFF files that are not WebP are rejected", () => {
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull();
  });
  test("stored extensions come only from the fixed map", () => {
    expect(Object.values(IMAGE_EXTENSIONS).sort()).toEqual(["jpg", "png", "webp"]);
  });
});

describe("security headers (#3)", () => {
  test("production domain gets framing, CSP and HSTS protection", () => {
    const h = securityHeadersFor("shreekantseeds.in");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });
  test("preview hosts keep frameable responses but still get nosniff", () => {
    const h = securityHeadersFor("preview.example.com");
    expect(h["X-Frame-Options"]).toBeUndefined();
    expect(h["Strict-Transport-Security"]).toBeUndefined();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("merchant MFA claim parsing", () => {
  test("reads aal from verified claims, never assumes aal2", () => {
    expect(assuranceLevelOf({ aal: "aal2" })).toBe("aal2");
    expect(assuranceLevelOf({ aal: "aal1" })).toBe("aal1");
    expect(assuranceLevelOf({})).toBeNull();
    expect(assuranceLevelOf(null)).toBeNull();
  });
});

describe("merchant entry point (E)", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  test("/admin no longer redirects signed-out visitors to the sign-in page", () => {
    const admin = read("../routes/admin.tsx");
    expect(admin).toContain("throw notFound()");
    expect(admin).not.toContain("redirect(");
  });
  test("storefront never links to the merchant sign-in", () => {
    for (const f of ["../components/store/core.tsx", "../components/store/pages.tsx", "../routes/__root.tsx", "../../public/robots.txt"]) {
      expect(read(f)).not.toContain("sks-4827");
    }
  });
});
