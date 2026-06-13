import { describe, it, expect } from "vitest";
import { normaliseName } from "@/lib/players";

describe("normaliseName", () => {
  it("strips diacritics", () => {
    expect(normaliseName("Lisandro Martínez")).toBe("lisandro martinez");
    expect(normaliseName("Noussaïr Mazraoui")).toBe("noussair mazraoui");
    expect(normaliseName("Amad Diallo Traoré")).toBe("amad diallo traore");
  });

  it("lowercases", () => {
    expect(normaliseName("BRUNO FERNANDES")).toBe("bruno fernandes");
    expect(normaliseName("Bruno Fernandes")).toBe("bruno fernandes");
  });

  it("strips non-alpha characters (hyphens removed, not replaced with space)", () => {
    expect(normaliseName("O'Brien")).toBe("obrien");
    expect(normaliseName("De-Ligt")).toBe("deligt");
  });

  it("collapses extra whitespace", () => {
    expect(normaliseName("  Bruno   Fernandes  ")).toBe("bruno fernandes");
  });

  it("handles empty string", () => {
    expect(normaliseName("")).toBe("");
  });
});
