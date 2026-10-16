import { useMemo } from "react";
import { downloadBlob, downloadScenario, fileName, readScenarioFile } from "../data/files";
import { PLAN_SIZE, drawPlan } from "../data/plan";
import { jpegPagePdf } from "../domain/export/pdf";
import type { Studio } from "../scene/context";
import { StudioContext } from "../scene/context";
import { Studio3D } from "../scene/Studio3D";
import { Thumbnail } from "../scene/Thumbnail";
import { newId } from "./boot";
import { type Services, ServicesContext } from "../ui/services";
import { StudioUI } from "../ui/StudioUI";

const params = new URLSearchParams(window.location.search);
/** Printed on exports. */
const EVENT = "Le Richmond · 21 Nov 2026";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), type, quality),
  );
const bare = params.has("bare");
const thumb = params.get("thumb");

export function App({ studio }: { studio: Studio }) {
  const services = useMemo<Services>(
    () => ({
      exportScenario: (id) => {
        const s = studio.editor.store.getState().scenarios[id];
        if (s) downloadScenario(s);
      },
      importScenario: async (file) => {
        try {
          const s = await readScenarioFile(file, newId(), new Date().toISOString());
          studio.editor.addScenario(s);
          studio.editor.notify(`Imported “${s.name}”`);
        } catch (e) {
          // Our own messages explain the problem ("too large"); parser errors are not for people.
          const own = e instanceof Error && e.message.startsWith("That file");
          studio.editor.notify(own ? e.message : "That file isn't a Richmond Studio scenario.");
        }
      },
      exportPlan: async (format) => {
        const scenario = studio.editor.active();
        const canvas = document.createElement("canvas");
        const today = new Date().toLocaleDateString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        drawPlan(canvas, scenario, studio.venue, studio.catalog, EVENT, today);
        if (format === "png") {
          downloadBlob(await toBlob(canvas, "image/png"), fileName(`${scenario.name} plan`, "png"));
          return;
        }
        const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
        const pdf = jpegPagePdf(jpeg, PLAN_SIZE.width, PLAN_SIZE.height);
        downloadBlob(
          new Blob([pdf.slice().buffer], { type: "application/pdf" }),
          fileName(`${scenario.name} plan`, "pdf"),
        );
      },
      saveView: async () => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=studio-canvas] canvas");
        if (!canvas) return;
        downloadBlob(
          await toBlob(canvas, "image/png"),
          fileName(`${studio.editor.active().name} view`, "png"),
        );
      },
    }),
    [studio],
  );
  if (thumb) return <Thumbnail base={studio} id={thumb} />;
  return (
    <StudioContext.Provider value={studio}>
      <ServicesContext.Provider value={services}>
        <div className="studio">
          <div className="viewport">
            <Studio3D studio={studio} />
          </div>
          {!bare && <StudioUI />}
        </div>
      </ServicesContext.Provider>
    </StudioContext.Provider>
  );
}
