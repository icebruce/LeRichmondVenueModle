import { exportScenario, importScenario } from "../domain/scenario/scenario";
import type { Scenario } from "../domain/scenario/schema";

/** File name from a scenario name, safe on every system. */
export function fileName(name: string, ext: string): string {
  const safe = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*·\s*/g, " - ")
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "scenario"}.${ext}`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadScenario(s: Scenario): void {
  downloadBlob(
    new Blob([exportScenario(s)], { type: "application/json" }),
    fileName(s.name, "richmond.json"),
  );
}

export async function readScenarioFile(file: File, newId: string, now: string): Promise<Scenario> {
  if (file.size > 2_000_000) throw new Error("That file is too large to be a scenario.");
  return importScenario(await file.text(), newId, now);
}
