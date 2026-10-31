import { test, expect } from "@playwright/test";
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
  CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
  CONTENT_WATCH_VALUES_MESSAGE_TYPE,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
  TURBO_EVENT_PUSH_TYPE,
} from "../../lib/constants.js";
import {
  deepFixtureUrl,
  fixturesRoot,
  fixtureUrl,
  outletsFixtureUrl,
  stimulusAppFixtureUrl,
  StimulusAppFixtureUrl,
  withChromiumExtension,
  getExtensionDevtoolsFrame,
  sendToContentScript,
  withPanelMessagesListener,
  withStaticServer,
} from "./helpers.js";

async function gotoFixture(page, origin) {
  await page.goto(fixtureUrl(origin));
}

async function withFixturePage(testBody) {
  await withStaticServer(fixturesRoot, async (origin) => {
    await withChromiumExtension(async ({ page, context }) => {
      await gotoFixture(page, origin);
      await testBody({ page, context, origin });
    });
  });
}

// Dispatch in the page realm so incoming frames are real page-owned Elements.
async function dispatchFrameCaptureScenarios(page) {
  return page.evaluate(() => {
    const source = document.querySelector("turbo-frame");
    const incoming = document.createElement("turbo-frame");
    incoming.id = "incoming";
    incoming.setAttribute("src", "/incoming");
    incoming.innerHTML = "<p>snapshot &amp; content</p>";
    const html = incoming.outerHTML;
    const timestamp = Date.now();
    const dispatch = (name, detail) =>
      source.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
    dispatch("turbo:before-frame-render", { newFrame: incoming });
    incoming.textContent = "changed after dispatch";
    dispatch("turbo:before-frame-render");
    incoming.textContent = "x".repeat(65536);
    dispatch("turbo:before-frame-render", { newFrame: incoming });
    dispatch("turbo:load", { url: "/isolated-load" });
    dispatch("turbo:click", { url: "/isolated-click" });
    return { html, timestamp, targetId: source.id };
  });
}

async function observeStorage(page) {
  return page.evaluate(() => {
    window.__storageRecords = [];
    window.__storageObserver = new MutationObserver((records) =>
      window.__storageRecords.push(...records),
    );
    window.__storageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    return document.documentElement.outerHTML;
  });
}

async function expectStorageDidNotMutateDOM(page, html) {
  const snapshot = await page.evaluate(() => {
    const records = [
      ...window.__storageRecords,
      ...window.__storageObserver.takeRecords(),
    ];
    window.__storageObserver.disconnect();
    delete window.__storageObserver;
    delete window.__storageRecords;
    return {
      html: document.documentElement.outerHTML,
      mutations: records.length,
    };
  });
  expect(snapshot).toEqual({ html, mutations: 0 });
}

test.describe("Content Script", () => {
  test("registers the DevTools panel", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withChromiumExtension(async ({ context }) => {
      const frame = await getExtensionDevtoolsFrame(context);

      const hasDevtools = await frame.evaluate(
        () => typeof chrome?.devtools?.panels?.create === "function",
      );
      expect(hasDevtools).toBe(true);
    });
  });

  test("scans and displays turbo-frames", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await gotoFixture(page, origin);

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_SCAN_MESSAGE_TYPE,
        });

        const frames = result.items.filter(
          (item) => item.tagName === "turbo-frame",
        );
        expect(frames).toHaveLength(2);
        expect(frames.map((f) => f.id)).toEqual(["main-frame", "nested-frame"]);
        expect(frames[0].src).toBe("/main");
        expect(frames[0].controllers).toEqual(["sidebar"]);
        expect(frames[1].parentId).toBe("main-frame");
      });
    });
  });

  test("scans and displays Stimulus controllers", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });

      const controllers = result.items.filter((item) => item.tagName === "div");
      expect(controllers).toHaveLength(2);

      const multi = controllers.find((c) => c.controllers.includes("modal"));
      expect(multi.controllers).toEqual(["modal", "dropdown"]);
      expect(multi.parentId).toBe("nested-frame");

      const sidebar = controllers.find((c) =>
        c.controllers.includes("sidebar"),
      );
      expect(sidebar.parentId).toBeNull();

      const target = result.items.find((item) => item.id === "modal-close");
      expect(target).toMatchObject({
        parentId: multi.id,
        tagName: "button",
        controllers: [],
        targets: [
          { controller: "modal", name: "closeButton" },
          { controller: "modal", name: "trigger" },
          { controller: "dropdown", name: "item" },
        ],
      });
    });
  });

  test("highlights element on hover", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, {
        type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
        id: "main-frame",
      });

      expect(result).toEqual({ success: true });

      await expect(page.locator("body > div")).toHaveCount(2);
      const overlay = page.locator("body > div").last();
      await expect(overlay).toHaveCSS("position", "fixed");
      await expect(overlay).toHaveCSS("pointer-events", "none");
      await expect(overlay).toHaveCSS("z-index", "2147483647");
      await expect(overlay).toHaveCSS("box-sizing", "border-box");
      await expect(overlay).toHaveCSS("outline-style", "dashed");

      const overlayBox = await overlay.boundingBox();
      const targetBox = await page.locator("#main-frame").boundingBox();
      expect(overlayBox).toEqual(targetBox);
    });
  });

  test("removes highlight on mouse leave", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      await sendToContentScript(frame, {
        type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
        id: "main-frame",
      });
      await sendToContentScript(frame, {
        type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
      });

      await expect(page.locator("body > div")).toHaveCount(1);
    });
  });

  test("inspect returns a valid selector", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, {
        type: CONTENT_INSPECT_MESSAGE_TYPE,
        id: "main-frame",
      });

      expect(result.success).toBe(true);
      expect(result.selector).toBe("#main-frame");

      const found = page.locator(result.selector);
      await expect(found).toHaveCount(1);
    });
  });

  test("stores a Stimulus controller as a temp variable", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const scanResult = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });
      const modalController = scanResult.items.find((item) =>
        item.controllers?.includes("modal"),
      );
      const html = await observeStorage(page);
      const result = await sendToContentScript(frame, {
        type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
        id: modalController.id,
        identifier: "modal",
      });

      expect(result).toEqual({
        success: true,
        name: "temp1",
        identifier: "modal",
      });
      await expectStorageDidNotMutateDOM(page, html);
      await expect(page.locator("body > div")).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(() => window.temp1 === window.modalController),
        )
        .toBe(true);
      const consoleResult = await frame.evaluate(
        () =>
          new Promise((resolve, reject) => {
            chrome.devtools.inspectedWindow.eval(
              "({ type: typeof temp1, matches: temp1 === window.modalController })",
              (result, exception) => {
                if (exception) reject(new Error(JSON.stringify(exception)));
                else resolve(result);
              },
            );
          }),
      );
      expect(consoleResult).toEqual({ type: "object", matches: true });
    });
  });

  for (const [label, type] of [
    ["values", CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE],
    ["outlets", CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE],
  ]) {
    test(`stores before and after MAIN ${label} lookup without extra script insertion`, async () => {
      await withFixturePage(async ({ page, context }) => {
        const frame = await getExtensionDevtoolsFrame(context);
        const { items } = await sendToContentScript(frame, {
          type: CONTENT_SCAN_MESSAGE_TYPE,
        });
        const { id } = items.find((item) => item.controllers.includes("modal"));
        await page.evaluate(() => {
          window.temp1 = "occupied";
        });
        const html = await observeStorage(page);
        expect(
          await sendToContentScript(frame, {
            type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
            id,
            identifier: "modal",
          }),
        ).toEqual({ success: true, name: "temp2", identifier: "modal" });
        await expectStorageDidNotMutateDOM(page, html);
        expect(
          await page.evaluate(
            () =>
              window.temp1 === "occupied" &&
              window.temp2 === window.modalController,
          ),
        ).toBe(true);
        const scriptsBefore = await page.locator("script").count();
        const lookupHtml = await observeStorage(page);
        expect(
          (await sendToContentScript(frame, { type, id, identifier: "modal" }))
            .success,
        ).toBe(true);
        await expect(page.locator("script")).toHaveCount(scriptsBefore);
        await expectStorageDidNotMutateDOM(page, lookupHtml);
        const afterLookup = await observeStorage(page);
        expect(
          await sendToContentScript(frame, {
            type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
            id,
            identifier: "modal",
          }),
        ).toEqual({ success: true, name: "temp3", identifier: "modal" });
        expect(
          await page.evaluate(() => window.temp3 === window.modalController),
        ).toBe(true);
        expect(
          await sendToContentScript(frame, {
            type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
            id,
            identifier: "missing",
          }),
        ).toEqual({ success: false, error: "Controller not found" });
        expect(await page.evaluate(() => "temp4" in window)).toBe(false);
        await expectStorageDidNotMutateDOM(page, afterLookup);
      });
    });
  }

  test("keeps real live values and definition requests working through reload and navigation", async () => {
    await withFixturePage(async ({ page, context, origin }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const scan = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });
      const { id } = scan.items.find((item) =>
        item.controllers.includes("modal"),
      );
      const scripts = await page.locator("script").count();
      await withPanelMessagesListener(frame, async ({ readMessages }) => {
        expect(
          await sendToContentScript(frame, {
            type: CONTENT_WATCH_VALUES_MESSAGE_TYPE,
            id,
            identifier: "modal",
          }),
        ).toEqual({ success: true });
        await page
          .locator('[data-controller~="modal"]')
          .evaluate((element) =>
            element.setAttribute("data-modal-title-value", "Changed live"),
          );
        await expect
          .poll(
            async () =>
              (await readMessages())
                .filter((message) => message.type === VALUES_CHANGED_PUSH_TYPE)
                .at(-1)
                ?.values.find((value) => value.name === "title")?.value,
          )
          .toBe("Changed live");
        expect(
          await sendToContentScript(frame, {
            type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
          }),
        ).toEqual({ success: true });
      });
      expect(
        (
          await sendToContentScript(frame, {
            type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
            id,
            identifier: "modal",
          })
        ).success,
      ).toBe(true);
      expect(
        await page.evaluate(() => window.temp1 === window.modalController),
      ).toBe(true);
      await expect(page.locator("script")).toHaveCount(scripts);
      await page.reload();
      expect(await page.evaluate(() => "temp1" in window)).toBe(false);
      for (const url of [null, outletsFixtureUrl(origin), fixtureUrl(origin)]) {
        if (url) await page.goto(url);
        const currentFrame = await getExtensionDevtoolsFrame(context);
        const currentScan = await sendToContentScript(currentFrame, {
          type: CONTENT_SCAN_MESSAGE_TYPE,
        });
        const host = currentScan.items.find((item) =>
          item.controllers.includes("modal"),
        );
        const scriptsBefore = await page.locator("script").count();
        for (const type of [
          CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
          CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
        ]) {
          expect(
            (
              await sendToContentScript(currentFrame, {
                type,
                id: host.id,
                identifier: "modal",
              })
            ).success,
          ).toBe(true);
        }
        await expect(page.locator("script")).toHaveCount(scriptsBefore);
      }
    });
  });

  test("reports Stimulus controller values", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const scanResult = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });
      const modalController = scanResult.items.find((item) =>
        item.controllers?.includes("modal"),
      );
      const result = await sendToContentScript(frame, {
        type: CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
        id: modalController.id,
        identifier: "modal",
      });

      expect(result).toEqual({
        success: true,
        values: [
          {
            name: "title",
            type: "string",
            value: "Greeting",
            defaultValue: "",
            hasValue: true,
          },
          {
            name: "count",
            type: "number",
            value: "42",
            defaultValue: 0,
            hasValue: true,
          },
          {
            name: "enabled",
            type: "boolean",
            value: null,
            defaultValue: false,
            hasValue: false,
          },
        ],
      });
    });
  });

  test("reports an error when reading values for an unknown element", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, {
        type: CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE,
        id: "missing",
        identifier: "modal",
      });

      expect(result).toEqual({
        success: false,
        error: "Element not found",
      });
    });
  });

  test("handles empty page gracefully", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withChromiumExtension(async ({ page, context }) => {
      await page.goto("about:blank");

      const frame = await getExtensionDevtoolsFrame(context);

      await expect(
        sendToContentScript(frame, { type: CONTENT_SCAN_MESSAGE_TYPE }),
      ).rejects.toThrow();
    });
  });

  test("builds correct parent-child relationships", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const result = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });

      const mainFrame = result.items.find((i) => i.id === "main-frame");
      const nestedFrame = result.items.find((i) => i.id === "nested-frame");
      const modalController = result.items.find((i) =>
        i.controllers?.includes("modal"),
      );
      const sidebarController = result.items.find((i) =>
        i.controllers?.includes("sidebar"),
      );

      expect(mainFrame.parentId).toBeNull();
      expect(nestedFrame.parentId).toBe("main-frame");
      expect(modalController.parentId).toBe("nested-frame");
      expect(sidebarController.parentId).toBeNull();
    });
  });

  test("rescans after dynamic DOM changes", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      const initialResult = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });

      expect(
        initialResult.items.find((item) => item.id === "dynamic-frame"),
      ).toBeUndefined();

      await page.locator("#nested-frame").evaluate((nestedFrame) => {
        const frameElement = document.createElement("turbo-frame");
        frameElement.id = "dynamic-frame";

        const controllerElement = document.createElement("div");
        controllerElement.id = "dynamic-controller";
        controllerElement.setAttribute("data-controller", "dynamic");
        controllerElement.textContent = "Dynamic content";

        frameElement.appendChild(controllerElement);
        nestedFrame.appendChild(frameElement);
      });

      const updatedResult = await sendToContentScript(frame, {
        type: CONTENT_SCAN_MESSAGE_TYPE,
      });
      const dynamicFrame = updatedResult.items.find(
        (item) => item.id === "dynamic-frame",
      );
      const dynamicController = updatedResult.items.find(
        (item) => item.id === "dynamic-controller",
      );

      expect(dynamicFrame).toMatchObject({
        id: "dynamic-frame",
        parentId: "nested-frame",
        tagName: "turbo-frame",
      });
      expect(dynamicController).toMatchObject({
        id: "dynamic-controller",
        parentId: "dynamic-frame",
        tagName: "div",
        controllers: ["dynamic"],
      });
    });
  });

  test("handles deeply nested elements", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(deepFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_SCAN_MESSAGE_TYPE,
        });
        const parentIdsById = Object.fromEntries(
          result.items.map((item) => [item.id, item.parentId]),
        );

        expect(result.items.map((item) => item.id)).toEqual([
          "level-1",
          "level-2",
          "level-3",
          "level-4",
          "level-5",
          "level-6",
          "level-7",
        ]);
        expect(parentIdsById).toMatchObject({
          "level-1": null,
          "level-2": "level-1",
          "level-3": "level-2",
          "level-4": "level-3",
          "level-5": "level-4",
          "level-6": "level-5",
          "level-7": "level-6",
        });
      });
    });
  });

  test("stores a controller when Stimulus is exposed as window.stimulusApp", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(stimulusAppFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const scanResult = await sendToContentScript(frame, {
          type: CONTENT_SCAN_MESSAGE_TYPE,
        });
        const modalController = scanResult.items.find((item) =>
          item.controllers?.includes("modal"),
        );
        const result = await sendToContentScript(frame, {
          type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
          id: modalController.id,
          identifier: "modal",
        });

        expect(result).toEqual({
          success: true,
          name: "temp1",
          identifier: "modal",
        });
        await expect
          .poll(() =>
            page.evaluate(() => window.temp1 === window.modalController),
          )
          .toBe(true);
      });
    });
  });

  test("stores a controller when Stimulus is exposed as window.StimulusApp", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(StimulusAppFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const scanResult = await sendToContentScript(frame, {
          type: CONTENT_SCAN_MESSAGE_TYPE,
        });
        const modalController = scanResult.items.find((item) =>
          item.controllers?.includes("modal"),
        );
        const result = await sendToContentScript(frame, {
          type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
          id: modalController.id,
          identifier: "modal",
        });

        expect(result).toEqual({
          success: true,
          name: "temp1",
          identifier: "modal",
        });
        await expect
          .poll(() =>
            page.evaluate(() => window.temp1 === window.modalController),
          )
          .toBe(true);
      });
    });
  });

  test("reports Stimulus targets for a controller", async ({ browserName }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(outletsFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        });

        expect(result).toEqual({
          success: true,
          targets: [
            {
              id: "modal-close",
              tagName: "button",
              name: "closeButton",
            },
          ],
        });
      });
    });
  });

  test("returns an error when reading targets for an unknown element", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(outletsFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE,
          id: "missing",
          identifier: "modal",
        });

        expect(result).toEqual({
          success: false,
          error: "Element not found",
        });
      });
    });
  });

  test("reports Stimulus outlets using declared selectors", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(outletsFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        });

        expect(result.success).toBe(true);
        expect(result.outlets).toEqual([
          {
            id: "user-status-element",
            tagName: "div",
            name: "user-status",
          },
          {
            id: expect.stringMatching(/hotwire-inspector-/),
            tagName: "nav",
            name: "menu",
          },
        ]);
      });
    });
  });

  test("returns an error when reading outlets for an unknown element", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(outletsFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
          id: "missing",
          identifier: "modal",
        });

        expect(result).toEqual({
          success: false,
          error: "Element not found",
        });
      });
    });
  });

  test("inspect works on a controller target element", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withStaticServer(fixturesRoot, async (origin) => {
      await withChromiumExtension(async ({ page, context }) => {
        await page.goto(outletsFixtureUrl(origin));

        const frame = await getExtensionDevtoolsFrame(context);
        const result = await sendToContentScript(frame, {
          type: CONTENT_INSPECT_MESSAGE_TYPE,
          id: "modal-close",
        });

        expect(result.success).toBe(true);
        expect(result.selector).toBe("#modal-close");
      });
    });
  });

  test("synthetic Turbo-shaped frame events snapshot real Elements exactly once", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");
    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);
      await withPanelMessagesListener(frame, async ({ readMessages }) => {
        const expected = await dispatchFrameCaptureScenarios(page);
        const pushes = async () =>
          (await readMessages()).filter(
            (message) => message.type === TURBO_EVENT_PUSH_TYPE,
          );
        await expect.poll(async () => (await pushes()).length).toBe(5);
        // Let queued relay messages settle before ruling out duplicate ownership.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const messages = await pushes();
        expect(messages).toHaveLength(5);
        expect(
          messages.map(({ name, details, targetId }) => ({
            name,
            details,
            targetId,
          })),
        ).toEqual([
          {
            name: "turbo:before-frame-render",
            targetId: expected.targetId,
            details: {
              newFrameSrc: "/incoming",
              newFrameId: "incoming",
              html: expected.html,
            },
          },
          {
            name: "turbo:before-frame-render",
            targetId: expected.targetId,
            details: {},
          },
          {
            name: "turbo:before-frame-render",
            targetId: expected.targetId,
            details: {
              newFrameSrc: "/incoming",
              newFrameId: "incoming",
              htmlError: "HTML omitted: exceeds 65536 code units",
            },
          },
          {
            name: "turbo:load",
            targetId: expected.targetId,
            details: { url: "/isolated-load" },
          },
          {
            name: "turbo:click",
            targetId: expected.targetId,
            details: { url: "/isolated-click" },
          },
        ]);
        for (const message of messages)
          expect(Math.abs(message.timestamp - expected.timestamp)).toBeLessThan(
            1000,
          );
      });
    });
  });

  test("forwards Turbo events dispatched on the page to the events port", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);

      await withPanelMessagesListener(frame, async ({ readMessages }) => {
        await page.evaluate(() => {
          document.dispatchEvent(
            new CustomEvent("turbo:load", { bubbles: true }),
          );
          document.dispatchEvent(
            new CustomEvent("turbo:render", { bubbles: true }),
          );
        });

        await expect.poll(readMessages).toEqual([
          expect.objectContaining({
            type: TURBO_EVENT_PUSH_TYPE,
            name: "turbo:load",
          }),
          expect.objectContaining({
            type: TURBO_EVENT_PUSH_TYPE,
            name: "turbo:render",
          }),
        ]);
      });
    });
  });

  test("Turbo events carry the dispatching element's inspector targetId", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      await page.evaluate(() => {
        const link = document.createElement("a");
        link.id = "preview-link";
        link.textContent = "link";
        document.body.appendChild(link);
      });

      const frame = await getExtensionDevtoolsFrame(context);

      await withPanelMessagesListener(frame, async ({ readMessages }) => {
        await page.evaluate(() => {
          document
            .getElementById("preview-link")
            .dispatchEvent(new CustomEvent("turbo:click", { bubbles: true }));
        });

        await expect.poll(readMessages).toContainEqual(
          expect.objectContaining({
            type: TURBO_EVENT_PUSH_TYPE,
            name: "turbo:click",
            targetId: "preview-link",
          }),
        );
      });

      // The same content-script pipeline that stamped targetId for the
      // push also replies to a direct inspect request with a selector
      // pointing at the matching element.
      const inspectResult = await sendToContentScript(frame, {
        type: CONTENT_INSPECT_MESSAGE_TYPE,
        id: "preview-link",
      });
      expect(inspectResult.success).toBe(true);
      expect(inspectResult.selector).toBe("#preview-link");

      // Removing the element from the page invalidates the live key, so
      // the next inspect request through the same path reports a miss.
      await page.evaluate(() => {
        document.getElementById("preview-link").remove();
      });

      const afterRemoval = await sendToContentScript(frame, {
        type: CONTENT_INSPECT_MESSAGE_TYPE,
        id: "preview-link",
      });
      expect(afterRemoval).toEqual({ success: false, selector: null });
    });
  });

  test("turbo:load details (URL) propagate through the content→panel port", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);

      await withPanelMessagesListener(frame, async ({ readMessages }) => {
        await page.evaluate(() => {
          document.dispatchEvent(
            new CustomEvent("turbo:load", {
              bubbles: true,
              detail: { url: "https://app.test/dashboard" },
            }),
          );
        });

        await expect.poll(readMessages).toContainEqual(
          expect.objectContaining({
            type: TURBO_EVENT_PUSH_TYPE,
            name: "turbo:load",
            details: { url: "https://app.test/dashboard" },
          }),
        );
      });
    });
  });

  test("turbo:submit-end details (success + error) propagate through the content→panel port", async ({
    browserName,
  }) => {
    test.skip(browserName !== "chromium");

    await withFixturePage(async ({ page, context }) => {
      const frame = await getExtensionDevtoolsFrame(context);

      await withPanelMessagesListener(frame, async ({ readMessages }) => {
        await page.evaluate(() => {
          document.dispatchEvent(
            new CustomEvent("turbo:submit-end", {
              bubbles: true,
              detail: {
                success: false,
                error: new Error("network unreachable"),
              },
            }),
          );
        });

        await expect.poll(readMessages).toContainEqual(
          expect.objectContaining({
            type: TURBO_EVENT_PUSH_TYPE,
            name: "turbo:submit-end",
            details: { success: "false", error: "network unreachable" },
          }),
        );
      });
    });
  });
});
