/** Spellings a search treats as one (Canadian and US). */
const SAME_WORD: Record<string, string> = {
  center: "centre",
  centerpiece: "centrepiece",
  color: "colour",
  gray: "grey",
};

/** Text as search words in their plain form: lower case, a plural "s" dropped, spelling unified. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => {
      const one = word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
      return SAME_WORD[one] ?? one;
    });
}

/** A search matches when every word of it starts a word of the text (LIB-13). */
export function matchesSearch(words: readonly string[], text: string): boolean {
  const own = searchWords(text);
  return words.every((w) => own.some((t) => t.startsWith(w)));
}
