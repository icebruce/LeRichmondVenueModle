import { createContext, useContext } from "react";

/** I/O the UI needs but may not implement itself (ARCHITECTURE §3: ui does not import data). */
export type Services = {
  exportScenario: (id: string) => void;
  importScenario: (file: File) => Promise<void>;
};

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error("ServicesContext missing");
  return s;
}
