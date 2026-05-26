import { describe, expect, it } from "vitest";
import { mapImportError, parseSelectedIndices } from "./api-utils";

describe("import api utils", () => {
  it("parses valid selected indices and drops invalid values", () => {
    const parsed = parseSelectedIndices([0, 2, -1, 1.5, "3", null]);
    expect(parsed).toEqual([0, 2]);
  });

  it("returns undefined when selected indices is not an array", () => {
    expect(parseSelectedIndices(undefined)).toBeUndefined();
    expect(parseSelectedIndices({})).toBeUndefined();
  });

  it("maps known import validation errors to 400", () => {
    const result = mapImportError(new Error("invalid format"));
    expect(result).toEqual({ message: "invalid format", status: 400 });
  });

  it("maps unknown errors to 500", () => {
    const result = mapImportError(new Error("boom"));
    expect(result).toEqual({ message: "boom", status: 500 });
  });
});
