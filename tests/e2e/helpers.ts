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

export async function setCamera(page: Page, mode: "dollhouse" | "plan" | "walk") {
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
