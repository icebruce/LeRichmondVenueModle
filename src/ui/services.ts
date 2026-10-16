import { createContext, useContext } from "react";

/** I/O the UI needs but may not implement itself (ARCHITECTURE §3: ui does not import data). */
export type Services = {
  exportScenario: (id: string) => void;
  importScenario: (file: File) => Promise<void>;
  /** The active scenario's plan for the venue, as PNG or PDF (EXP-01). */
  exportPlan: (format: "png" | "pdf") => Promise<void>;
  /** What the camera shows now, as a PNG (EXP-02). */
  saveView: () => Promise<void>;
};

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error("ServicesContext missing");
  return s;
}
