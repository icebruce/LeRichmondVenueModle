import { exportScenario, importScenario } from "../domain/scenario/scenario";
import type { Scenario } from "../domain/scenario/schema";

export function downloadScenario(s: Scenario): void {
  const blob = new Blob([exportScenario(s)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${s.name.replace(/[^\w\- ·]+/g, "").trim() || "scenario"}.richmond.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readScenarioFile(file: File, newId: string, now: string): Promise<Scenario> {
  if (file.size > 2_000_000) throw new Error("That file is too large to be a scenario.");
  return importScenario(await file.text(), newId, now);
}
