import { useMemo } from "react";
import { downloadScenario, readScenarioFile } from "../data/files";
import type { Studio } from "../scene/context";
import { StudioContext } from "../scene/context";
import { Studio3D } from "../scene/Studio3D";
import { Thumbnail } from "../scene/Thumbnail";
import { newId } from "./boot";
import { type Services, ServicesContext } from "../ui/services";
import { StudioUI } from "../ui/StudioUI";

const params = new URLSearchParams(window.location.search);
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
