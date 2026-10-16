import { createContext, useContext } from "react";
import type { VersionInfo } from "../domain/scenario/schema";

/** I/O the UI needs but may not implement itself (ARCHITECTURE §3: ui does not import data). */
export type Services = {
  exportScenario: (id: string) => void;
  importScenario: (file: File) => Promise<void>;
  /** The active scenario's plan for the venue, as PNG or PDF (EXP-01). */
  exportPlan: (format: "png" | "pdf") => Promise<void>;
  /** What the camera shows now, as a PNG (EXP-02). */
  saveView: () => Promise<void>;
  /** Shared cloud saving (ACC-01, SCN-02..05). */
  cloud: CloudServices;
};

export type Partner = "A" | "B";
export type { VersionInfo };

export type CloudServices = {
  status: "on" | "signin" | "off";
  partner: Partner | null;
  /** null when signed in, else what to tell the couple. */
  signIn: (password: string, partner: Partner) => Promise<string | null>;
  choosePartner: (p: Partner) => void;
  resolve: (choice: "mine" | "theirs" | "copy") => Promise<void>;
  versions: (id: string) => Promise<VersionInfo[]>;
  restore: (id: string, revision: number) => Promise<boolean>;
};

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error("ServicesContext missing");
  return s;
}
