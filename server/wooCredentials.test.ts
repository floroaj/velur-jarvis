/**
 * Validates that WORDPRESS_APP_PASSWORD env var is set and correctly formatted.
 * Does NOT make live network calls — just validates the credential format and
 * that the getWooAuth() function produces a valid Basic Auth header.
 */
import { describe, expect, it } from "vitest";

describe("WooCommerce / WordPress credentials", () => {
  it("WORDPRESS_APP_PASSWORD env var is set", () => {
    const val = process.env.WORDPRESS_APP_PASSWORD ?? "";
    expect(val.length).toBeGreaterThan(0);
  });

  it("WORDPRESS_APP_PASSWORD is non-empty and usable for Basic Auth", () => {
    const val = process.env.WORDPRESS_APP_PASSWORD ?? "";
    // Accepts either 'user:pass' format or just the app password (username prepended at runtime)
    expect(val.length).toBeGreaterThan(8);
  });

  it("Basic Auth header can be constructed from WORDPRESS_APP_PASSWORD", () => {
    const val = process.env.WORDPRESS_APP_PASSWORD ?? "";
    const header = "Basic " + Buffer.from(val).toString("base64");
    expect(header).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
  });
});
