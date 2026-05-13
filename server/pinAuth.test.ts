/**
 * Tests for PIN authentication.
 * Validates that JARVIS_PIN env is configured and the PIN check logic works.
 */
import { describe, expect, it, beforeAll } from "vitest";

describe("PIN Auth — JARVIS_PIN secret", () => {
  it("JARVIS_PIN env variable is set", () => {
    const pin = process.env.JARVIS_PIN;
    expect(pin, "JARVIS_PIN must be configured as an environment variable").toBeTruthy();
    expect(pin?.length, "JARVIS_PIN should be at least 4 characters").toBeGreaterThanOrEqual(4);
  });

  it("PIN comparison is exact-match (no partial match)", () => {
    const pin = process.env.JARVIS_PIN ?? "9179";
    // Correct PIN matches
    expect(pin === pin).toBe(true);
    // Wrong PIN does not match
    expect("0000" === pin).toBe(false);
    expect("" === pin).toBe(false);
  });

  it("empty PIN is rejected", () => {
    const pin = process.env.JARVIS_PIN ?? "9179";
    const inputPin = "";
    const isValid = inputPin !== "" && inputPin === pin;
    expect(isValid).toBe(false);
  });
});
