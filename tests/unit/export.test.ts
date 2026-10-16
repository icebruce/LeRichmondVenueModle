import { describe, expect, test } from "vitest";
import { jpegPagePdf } from "../../src/domain/export/pdf";

describe("export", () => {
  test("[EXP-01] the PDF is one Letter page holding the plan image, with a valid cross-reference table", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const pdf = jpegPagePdf(jpeg, 1650, 1275);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 792 612]");
    expect(text).toContain("/Width 1650 /Height 1275");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // Every xref offset points at the start of its object.
    const xref = text.slice(text.indexOf("xref"));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(text.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
    const start = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(start, start + 4)).toBe("xref");
  });
});
