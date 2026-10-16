/**
 * Artwork the couple can hang instead of the venue's paintings (VEN-05). Drawn procedurally from a
 * palette, like the stand-ins for the current paintings (no third-party images, ADR-6).
 */
export const ARTWORKS: readonly { id: string; name: string; palette: readonly string[] }[] = [
  { id: "botanical", name: "Botanical", palette: ["#24382b", "#5f7f5a", "#a9c29a", "#e9e4d3", "#c99a5b"] },
  { id: "blush", name: "Soft blush", palette: ["#f3e3dc", "#e3b8ad", "#c9877d", "#8f5b54", "#faf6f0"] },
  {
    id: "monochrome",
    name: "Black and white",
    palette: ["#111111", "#4a4a4a", "#9a9a9a", "#e6e6e6", "#ffffff"],
  },
  { id: "gold", name: "Gold and ivory", palette: ["#f4eee0", "#d9c08a", "#b08d48", "#6f5a35", "#2b2620"] },
];

/** The painting to show for a venue painting: hidden, its own, or a chosen artwork. */
export function artFor(
  choice: string | undefined,
  own: readonly string[],
): { hidden: true } | { hidden: false; palette: readonly string[] } {
  if (choice === "hidden") return { hidden: true };
  const art = ARTWORKS.find((a) => a.id === choice);
  return { hidden: false, palette: art?.palette ?? own };
}
