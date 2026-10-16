import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/tokens.css";
import "../ui/studio.css";
import { boot } from "./boot";
import { App } from "./App";

const root = createRoot(document.getElementById("root") as HTMLElement);
boot()
  .then(({ studio, cloud }) =>
    root.render(
      <StrictMode>
        <App studio={studio} cloud={cloud} />
      </StrictMode>,
    ),
  )
  .catch((e: unknown) => {
    console.error(e);
    root.render(
      <p className="fatal">
        Richmond Studio could not start. Reload the page; if it persists, clear this site's data.
      </p>,
    );
  });
