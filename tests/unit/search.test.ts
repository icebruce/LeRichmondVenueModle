import { describe, expect, test } from "vitest";
import { matchesSearch, searchWords } from "../../src/domain/library/search";

describe("library search", () => {
  test("[LIB-13] plurals and US spellings find the same words", () => {
    expect(searchWords("Candles, CENTERPIECES and colors")).toEqual([
      "candle",
      "centrepiece",
      "and",
      "colour",
    ]);
    expect(matchesSearch(searchWords("candles"), "Tall tapers · Candles")).toBe(true);
    expect(matchesSearch(searchWords("centerpiece"), "Low arrangement · Centrepiece")).toBe(true);
  });

  test("[LIB-13] every word must start a word of the piece; nothing else matches", () => {
    const table = "Round table 4–10 guests · ≈ 1.5 m for 8 Tables";
    expect(matchesSearch(searchWords("round tab"), table)).toBe(true);
    expect(matchesSearch(searchWords("candle"), table)).toBe(false);
    expect(matchesSearch(searchWords("mirror"), table)).toBe(false); // not the "m" of "1.5 m"
    expect(matchesSearch(searchWords("zzzz"), table)).toBe(false);
    expect(matchesSearch(searchWords("und"), table)).toBe(false); // inside a word, not at its start
  });
});
