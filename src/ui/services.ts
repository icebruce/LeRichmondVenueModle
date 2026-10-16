import { createContext, useContext } from "react";
import type { VersionInfo } from "../domain/scenario/schema";
import type { CustomRequest, Imported } from "../domain/library/schema";

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
  /** Imported items, their photos and custom model requests (IMP, REQ). */
  library: LibraryServices;
};

/** A crop as fractions of the photo (0–1). */
export type Crop = { x: number; y: number; w: number; h: number };

export type LibraryServices = {
  /** Opens a photo the right way up; throws a message for the couple if it cannot. */
  decode: (file: Blob) => Promise<ImageBitmap>;
  /** The cropped photo, shrunk to ≤ 500 KB without its EXIF data, a thumbnail and its main colours. */
  prepare: (
    photo: ImageBitmap,
    crop: Crop,
  ) => Promise<{ blob: Blob; thumb: string; colours: string[]; aspect: number }>;
  addImport: (item: Imported, image: Blob) => Promise<void>;
  archiveImport: (id: string) => Promise<void>;
  /** Stores a request photo and returns its id. */
  addImage: (image: Blob) => Promise<string>;
  saveRequest: (request: CustomRequest) => Promise<void>;
  imageUrl: (id: string) => Promise<string | null>;
  newId: () => string;
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
