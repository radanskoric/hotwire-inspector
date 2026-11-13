import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { Window } from "happy-dom";
import { expect } from "@playwright/test";
import {
  withChromiumExtension,
  openPanelPage,
} from "../../../../tests/e2e/adapters/chromium-adapter.js";
import {
  openDetailsPanel,
  simulateTurboEvent,
} from "../../../../tests/e2e/support/panel-assertions.js";

const html = await readFile(
  new URL("../assets/todo.html", import.meta.url),
  "utf8",
);
const window = new Window();
window.document.write(html);
const elements = [
  ...window.document.querySelectorAll(
    "turbo-frame, [data-controller], [data-todo-target], [data-task-form-target], [data-todo-list-target]",
  ),
];
const scanResponse = {
  items: elements.map((element) => {
    let parent = element.parentElement;
    while (parent && !elements.includes(parent)) parent = parent.parentElement;
    return {
      id: element.id,
      parentId: parent?.id ?? null,
      tagName: element.localName,
      src: element.getAttribute("src"),
      controllers: (element.getAttribute("data-controller") ?? "")
        .split(" ")
        .filter(Boolean),
      targets: [...element.attributes]
        .filter((a) => /^data-.*-target$/.test(a.name))
        .flatMap((a) =>
          a.value
            .split(" ")
            .map((name) => ({ controller: a.name.slice(5, -7), name })),
        ),
    };
  }),
};
const todo = window.document.getElementById("todos");
const options = {
  scanResponse,
  valuesResponse: {
    success: true,
    values: [
      {
        name: "count",
        type: "number",
        value: todo.getAttribute("data-todo-list-count-value"),
        defaultValue: 0,
        hasValue: true,
      },
      {
        name: "filter",
        type: "string",
        value: todo.getAttribute("data-todo-list-filter-value"),
        defaultValue: "all",
        hasValue: true,
      },
    ],
  },
  targetsResponse: {
    success: true,
    targets: [{ id: "clear-tasks", tagName: "button", name: "clear" }],
  },
  outletsResponse: {
    success: true,
    outlets: [{ id: "task-count", tagName: "p", name: "counter" }],
  },
};
const destination = new URL(
  "../../../../website/assets/images/features/",
  import.meta.url,
);
await mkdir(destination, { recursive: true });
await withChromiumExtension(async ({ context }) => {
  for (const theme of ["light", "dark"]) {
    const page = await openPanelPage(context, {
      ...options,
      persistedTheme: theme,
    });
    await page.setViewportSize({ width: 620, height: 700 });
    const save = async (name, locator) => {
      await page.mouse.move(0, 0);
      await page.evaluate(() => {
        for (const animation of globalThis.document.getAnimations())
          animation.finish();
      });
      const box = await locator.boundingBox();
      const bottom = await page
        .locator(
          name === "controller"
            ? "#details-panel .details-panel-section"
            : name === "events"
              ? ".event-box"
              : "#tree .node-row:visible",
        )
        .last()
        .boundingBox();
      await page.screenshot({
        clip: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: bottom.y + bottom.height + 12 - box.y,
        },
        path: fileURLToPath(new URL(`${name}-${theme}.png`, destination)),
        animations: "disabled",
      });
    };
    await expect(page.locator("#summary")).toContainText("3 frames");
    for (const id of ["new-task", "task-2"]) {
      await page
        .locator(".node-row")
        .filter({
          has: page.locator(".node-id", { hasText: new RegExp(`^${id}$`) }),
        })
        .locator(".node-toggle")
        .click();
    }
    await save("tree", page.locator("#panel-elements"));
    await page.getByRole("combobox", { name: "Filter controllers" }).click();
    await page.locator('.ts-dropdown .option[data-value="counter"]').click();
    await expect(
      page.locator("#tree .badge").filter({ hasText: /^counter$/ }),
    ).toHaveCount(0);
    await expect(page.locator("#panel-elements .ts-dropdown")).toBeVisible();
    await save("filter", page.locator("#panel-elements"));
    await page.keyboard.press("Escape");
    const details = await openDetailsPanel(page, "todos", "todo-list");
    await expect(details.locator(".value-row")).toHaveCount(2);
    await save("controller", details);
    await details.locator(".details-panel-close").click();
    await page.locator("label.tab[for='tab-events']").click();
    for (const [index, name] of [
      "turbo:before-fetch-request",
      "turbo:before-frame-render",
      "turbo:frame-render",
      "turbo:frame-load",
    ].entries()) {
      await simulateTurboEvent(page, {
        type: "hotwire-inspector:turbo-event",
        name,
        timestamp: 1700000000000 + index * 35,
        targetId: "todos",
        details:
          name === "turbo:before-frame-render" ? { html: todo.outerHTML } : {},
      });
    }
    await expect(page.locator(".event-box")).toHaveCount(4);
    await save("events", page.locator("#panel-events"));
    await page.close();
  }
});
await window.happyDOM.close();
