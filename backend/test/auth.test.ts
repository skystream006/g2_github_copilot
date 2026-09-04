import { describe, expect, it } from "vitest";
import { extractBearerToken, safeCompare } from "../src/auth.js";

describe("safeCompare", () => {
  it("returns true for identical strings", () => {
    expect(safeCompare("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeCompare("abc123", "abc124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeCompare("short", "much-longer-token")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(safeCompare("", "abc123")).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearerToken(["Bearer", "abc123"].join(" "))).toBe("abc123");
  });

  it("is case-insensitive on the scheme", () => {
    expect(extractBearerToken(["bearer", " xyz"].join(""))).toBe("xyz");
  });

  it("returns null when there is no header", () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("returns null for a non-bearer scheme", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null when the token is missing", () => {
    expect(extractBearerToken("Bearer ")).toBeNull();
  });
});
