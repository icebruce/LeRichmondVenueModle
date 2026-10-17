import { type Page, expect } from "@playwright/test";

type Item = {
  id: string;
  libraryId: string;
  x: number;
  z: number;
  rotY: number;
  options: Record<string, unknown>;
};
export type W = Window & {
  __studio: {
    editor: {
      select: (ids: string[]) => void;
      store: {
        getState: () => {
          scenarios: Record<
            string,
            { items: Item[]; name: string; guests: { count: number }; style: Record<string, string> }
          >;
          activeId: string;
          order: string[];
          camera: string;
          selection: string[];
        };
      };
    };
  };
  __project: (x: number, y: number, z: number) => [number, number];
};

/** Wait until the camera animation has finished and two more frames have rendered. */
export async function settle(page: Page) {
  await page.waitForFunction(
    () => !(window as unknown as { __rig?: { tweening: boolean } }).__rig?.tweening,
    null,
    {
      timeout: 60_000,
    },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

export async function openStudio(page: Page, query = "fresh") {
  // Software rendering in CI is slow; the light quality tier keeps frames frequent enough to interact.
  await page.goto(`/?quality=low&${query}`);
  await page.waitForFunction(
    () => (window as unknown as W).__studio && (window as unknown as W).__project,
    null,
    { timeout: 60_000 },
  );
  await expect(page.locator(".loading")).toHaveCount(0, { timeout: 60_000 });
  await settle(page);
}

/** Opens a section (Room, Add, Style, Guests, Plans); its rail button closes it when already open. */
export async function openSection(page: Page, id: "room" | "add" | "style" | "guests" | "plans") {
  const tab = page.getByTestId(`section-${id}`);
  if ((await tab.getAttribute("aria-pressed")) !== "true") await tab.click();
}

/** Add › Yours: imports, ready models and requests. */
export async function openYours(page: Page) {
  await openSection(page, "add");
  await page.getByTestId("category-yours").click();
}

export async function setCamera(page: Page, mode: "dollhouse" | "plan" | "walk") {
  // Phones pick the camera from a menu in the top-right stack.
  const menu = page.getByTestId("camera-menu");
  if (await menu.isVisible()) await menu.click();
  await page.getByTestId(`camera-${mode}`).click();
  await page
    .waitForFunction(() => (window as unknown as { __rig?: { tweening: boolean } }).__rig?.tweening, null, {
      timeout: 10_000,
    })
    .catch(() => {});
  await settle(page);
}

export async function state(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as W).__studio.editor.store.getState();
    return { ...s, active: s.scenarios[s.activeId] };
  });
}

export async function item(page: Page, id: string): Promise<Item> {
  const s = await state(page);
  const it = s.active?.items.find((i) => i.id === id);
  if (!it) throw new Error(`no item ${id}`);
  return it;
}

export async function screenOf(page: Page, x: number, y: number, z: number): Promise<[number, number]> {
  return page.evaluate(
    ([a, b, c]) => (window as unknown as W).__project(a as number, b as number, c as number),
    [x, y, z],
  );
}

/** Drag an item's centre to a room position with real pointer events. */
export async function dragItem(page: Page, id: string, to: [number, number], height = 0.77) {
  const it = await item(page, id);
  const [sx, sy] = await screenOf(page, it.x, height, it.z);
  const [tx, ty] = await screenOf(page, to[0], height, to[1]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

/** A photo for import tests: a coloured object on a white background, as a PNG made in the page. */
export async function photoFile(page: Page, colour: string, w = 300, h = 400) {
  const data = await page.evaluate(
    ([c, width, height]) => {
      const canvas = document.createElement("canvas");
      canvas.width = width as number;
      canvas.height = height as number;
      const g = canvas.getContext("2d") as CanvasRenderingContext2D;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = c as string;
      g.fillRect(canvas.width * 0.3, canvas.height * 0.1, canvas.width * 0.4, canvas.height * 0.8);
      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    },
    [colour, w, h],
  );
  return { name: "inspiration.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

/** Runs the Inspiration import (IMP-01..05) up to the result step. */
export async function importPhoto(
  page: Page,
  { colour, type, w, h, link }: { colour: string; type: string; w: number; h: number; link?: string },
) {
  if (!(await page.getByTestId("add-inspiration").isVisible())) await openYours(page);
  await page.getByTestId("add-inspiration").click();
  if (link) await page.getByTestId("import-link").fill(link);
  await page.getByTestId("photo-file").setInputFiles(await photoFile(page, colour));
  await page.getByTestId(`import-type-${type}`).click();
  await page.getByTestId("import-next").click();
  await page.getByTestId("import-width").fill(String(w));
  await page.getByTestId("import-height").fill(String(h));
  await page.getByTestId("import-next").click();
  await expect(page.getByTestId("result-label")).toBeVisible({ timeout: 20_000 });
}
