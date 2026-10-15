import { useMemo } from "react";
import { downloadScenario, readScenarioFile } from "../data/files";
import type { Studio } from "../scene/context";
import { StudioContext } from "../scene/context";
import { Studio3D } from "../scene/Studio3D";
import { type Services, ServicesContext } from "../ui/services";
import { StudioUI } from "../ui/StudioUI";

export function App({ studio }: { studio: Studio }) {
  const services = useMemo<Services>(
    () => ({
      exportScenario: (id) => {
        const s = studio.editor.store.getState().scenarios[id];
        if (s) downloadScenario(s);
      },
      importScenario: async (file) => {
        try {
          const s = await readScenarioFile(file, crypto.randomUUID().slice(0, 8), new Date().toISOString());
          studio.editor.addScenario(s);
          studio.editor.notify(`Imported “${s.name}”`);
        } catch {
          studio.editor.notify("That file isn't a Richmond Studio scenario.");
        }
      },
    }),
    [studio],
  );
  return (
    <StudioContext.Provider value={studio}>
      <ServicesContext.Provider value={services}>
        <div className="studio">
          <div className="viewport">
            <Studio3D studio={studio} />
          </div>
          <StudioUI />
        </div>
      </ServicesContext.Provider>
    </StudioContext.Provider>
  );
}
