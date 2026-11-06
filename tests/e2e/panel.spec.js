import { expect, test } from "@playwright/test";
import { chromiumAdapter } from "./adapters/chromium-adapter.js";
import { firefoxAdapter } from "./adapters/firefox-adapter.js";
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
  CONTENT_WATCH_VALUES_MESSAGE_TYPE,
  ID_PREFIX,
  TREE_CHANGED_PUSH_TYPE,
  VALUES_CHANGED_PUSH_TYPE,
} from "../../lib/constants.js";
import {
  controllerRemovedScanResponse,
  deepScanResponse,
  emptyScanResponse,
  fixtureScanResponse,
  internalIdScanResponse,
  tallScanResponse,
  turboEventsFixturePush,
  turboEventsWithDetailsFixturePush,
} from "./support/panel-fixtures.js";
import {
  addMockPanelApis,
  clearRecordedMessages,
  expectDoubleClickTogglesNodeChildren,
  expectRefreshRescans,
  expectTabsVisible,
  expectThemeChanges,
  expectThemeSwitcher,
  expectTurboEventsTabEmptyState,
  getRecordedMessages,
  getRecordedEvalCalls,
  openDetailsPanel,
  simulateTreeChanged,
  simulateTurboEvent,
  simulateValuesChanged,
  withExpectedBadgeClickOpensDetailsPanel,
  withExpectedClickInspects,
  withExpectedControllerBadges,
  withExpectedDeepTree,
  withExpectedDetailsPanelPinnedOnScroll,
  withExpectedDetailsPanelRefresh,
  withExpectedDetailsPanelSections,
  withExpectedDetailsPanelValues,
  withExpectedDetailsPanelValuesNote,
  withExpectedEmptyState,
  withExpectedErrorState,
  withExpectedFrameSrc,
  withExpectedHeadingAndSummary,
  withExpectedHoverMessages,
  withExpectedInternalIdsHidden,
  withExpectedNestedTree,
  withExpectedNodeIds,
  withExpectedPersistedTheme,
  withExpectedTagNames,
  withExpectedTargetBadges,
} from "./support/panel-assertions.js";

import { TURBO_EVENT_NAMES } from "../../lib/turbo-event-watcher.js";

const adaptersByBrowserName = {
  chromium: chromiumAdapter,
  firefox: firefoxAdapter,
};

async function withPanel(adapter, page, options, testBody) {
  if (!adapter.capabilities.supportsDirectPanelPage) {
    test.skip(
      true,
      `${adapter.browserName} does not support direct panel-page tests`,
    );
  }

  if (adapter.browserName === "chromium") {
    await adapter.withExtension(async ({ context }) => {
      const panelPage = await adapter.openPanelPage(context, options);
      await testBody(panelPage);
    });
    return;
  }

  const panelPage = await adapter.openPanelPage(page, options);
  await testBody(panelPage);
}

test.describe("Panel UI", () => {
  test("wraps filter labels within narrow dropdowns", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage
          .locator("#panel-elements .filter")
          .evaluate((filter) => {
            filter.style.inlineSize = "70px";
          });
        await panelPage
          .getByRole("combobox", { name: "Filter controllers" })
          .click();
        await panelPage
          .getByRole("searchbox", { name: "Search controllers" })
          .fill("drop");
        const option = panelPage.getByRole("option", {
          name: "dropdown",
          exact: true,
        });
        await expect(option.locator(".highlight")).toHaveText("drop");
        const layout = await option.evaluate((option) => {
          const range = document.createRange();
          range.selectNodeContents(
            option.querySelector(".filter-option-label"),
          );
          return {
            lines: new Set([...range.getClientRects()].map((rect) => rect.top))
              .size,
            width: option.clientWidth,
            contentWidth: option.scrollWidth,
          };
        });
        expect(layout.lines).toBeGreaterThan(1);
        expect(layout.contentWidth).toBeLessThanOrEqual(layout.width);
      },
    );
  });

  test("keeps search highlights inline in both filters and themes", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        for (const [tab, noun, value, query] of [
          ["elements", "controllers", "sidebar", "ide"],
          ["events", "events", "turbo:load", "load"],
        ]) {
          await panelPage.locator(`label[for="tab-${tab}"]`).click();
          await panelPage
            .getByRole("combobox", { name: `Filter ${noun}` })
            .click();
          const search = panelPage.getByRole("searchbox", {
            name: `Search ${noun}`,
          });
          await search.fill(query);
          const option = panelPage.locator(
            `#panel-${tab} .option[data-value="${value}"]`,
          );
          await expect(option.locator(".highlight")).toHaveText(query);
          for (const theme of ["light", "dark"]) {
            await panelPage.locator("html").evaluate((html, theme) => {
              html.dataset.theme = theme;
            }, theme);
            const layout = await option.evaluate((option) => {
              const walker = document.createTreeWalker(
                option,
                NodeFilter.SHOW_TEXT,
              );
              const rects = [];
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (!node.textContent) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                rects.push(range.getBoundingClientRect());
              }
              return {
                largestGap: Math.max(
                  ...rects
                    .slice(1)
                    .map((rect, i) => Math.abs(rect.left - rects[i].right)),
                ),
                lineCount: new Set(rects.map((rect) => rect.top)).size,
                background: getComputedStyle(option.querySelector(".highlight"))
                  .backgroundColor,
              };
            });
            expect(layout.largestGap).toBeLessThan(1);
            expect(layout.lineCount).toBe(1);
            expect(layout.background).not.toBe("rgba(0, 0, 0, 0)");
          }
          await search.press("Escape");
        }
      },
    );
  });

  test("filters controller attachments with a compact searchable combobox", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        const combo = panelPage.getByRole("combobox", {
          name: "Filter controllers",
        });
        await expect(combo).toContainText("All controllers (3)");
        await openDetailsPanel(panelPage, "modal-controller", "modal");
        await combo.click();
        await expect(
          panelPage.locator("#panel-elements .ts-dropdown .option"),
        ).toHaveText(["dropdown", "modal", "sidebar"]);
        await panelPage
          .locator('#panel-elements .ts-dropdown .option[data-value="modal"]')
          .click();
        await expect(panelPage.locator("#details-panel")).not.toHaveClass(
          /open/,
        );
        await expect(panelPage.locator("#tree .badge")).toHaveText([
          "sidebar",
          "dropdown",
          "sidebar",
        ]);
        await expect(panelPage.locator("#tree .target-badge")).toHaveText([
          "dropdown#item",
        ]);
        await expect(panelPage.locator("#summary")).toHaveText(
          "2 frames, 3 of 4 controllers",
        );
        await panelPage
          .getByRole("searchbox", { name: "Search controllers" })
          .fill("side");
        await expect(
          panelPage.locator("#panel-elements .ts-dropdown .option"),
        ).toHaveText(["sidebar"]);
        await panelPage
          .getByRole("button", { name: "Clear all", exact: true })
          .click();
        await expect(combo).toContainText("No controllers selected");
        await expect(panelPage.locator("#tree .node")).toHaveCount(2);
        await panelPage
          .getByRole("button", { name: "Select all", exact: true })
          .click();
        await expect(combo).toContainText("All controllers (3)");
        await expect(panelPage.locator("#tree .node")).toHaveCount(5);
        await expect(panelPage.locator("#details-panel")).not.toHaveClass(
          /open/,
        );
        await panelPage
          .getByRole("searchbox", { name: "Search controllers" })
          .press("Tab");
        await expect(
          panelPage.getByRole("button", { name: "Select all", exact: true }),
        ).toBeFocused();
        await panelPage.keyboard.press("Tab");
        await expect(
          panelPage.getByRole("button", { name: "Clear all", exact: true }),
        ).toBeFocused();
        await panelPage.keyboard.press("Escape");
        await expect(combo).toBeFocused();
        await expect(combo).toHaveAttribute("aria-expanded", "false");
        await panelPage.locator('label[for="tab-events"]').click();
        await expect(combo).toBeHidden();
      },
    );
  });

  test.describe("controller filter persistence", () => {
    async function withClearedFilter(browserName, page, options, testBody) {
      const adapter = adaptersByBrowserName[browserName];
      test.skip(!adapter, `${browserName} does not have a panel adapter`);
      await withPanel(adapter, page, options, async (panelPage) => {
        const combo = panelPage.getByRole("combobox", {
          name: "Filter controllers",
        });
        await combo.click();
        await panelPage
          .getByRole("button", { name: "Clear all", exact: true })
          .click();
        await expect(combo).toContainText("No controllers selected");
        await testBody(panelPage, combo);
      });
    }

    test("preserves choices through refresh", async ({ browserName, page }) => {
      await withClearedFilter(
        browserName,
        page,
        {
          scanResponses: [
            fixtureScanResponse,
            {
              items: [
                ...fixtureScanResponse.items,
                { id: "new-frame", parentId: null, tagName: "turbo-frame" },
              ],
            },
          ],
        },
        async (panelPage, combo) => {
          await panelPage
            .getByRole("button", { name: "Refresh", exact: true })
            .click();
          await expect(combo).toContainText("No controllers selected");
          await expect(panelPage.locator("#tree .badge")).toHaveCount(0);
          await expect(panelPage.locator("#tree .node")).toHaveCount(3);
        },
      );
    });

    test("preserves choices through tab switches", async ({
      browserName,
      page,
    }) => {
      await withClearedFilter(
        browserName,
        page,
        { scanResponse: fixtureScanResponse },
        async (panelPage, combo) => {
          await panelPage.locator('label[for="tab-events"]').click();
          await panelPage.locator('label[for="tab-elements"]').click();
          await expect(combo).toContainText("No controllers selected");
          await expect(panelPage.locator("#tree .badge")).toHaveCount(0);
        },
      );
    });

    test("selects newly discovered identifiers", async ({
      browserName,
      page,
    }) => {
      const updated = {
        items: [
          ...fixtureScanResponse.items,
          {
            id: "new-controller",
            parentId: null,
            tagName: "div",
            controllers: ["new"],
          },
        ],
      };
      await withClearedFilter(
        browserName,
        page,
        { scanResponses: [fixtureScanResponse, updated] },
        async (panelPage, combo) => {
          await panelPage
            .getByRole("button", { name: "Refresh", exact: true })
            .click();
          await expect(combo).toContainText("1 of 4 controllers");
          await expect(panelPage.locator("#tree .badge")).toHaveText(["new"]);
        },
      );
    });

    test("resets choices on navigation", async ({ browserName, page }) => {
      await withClearedFilter(
        browserName,
        page,
        { scanResponse: fixtureScanResponse },
        async (panelPage, combo) => {
          await panelPage.evaluate(() =>
            globalThis.__hotwireInspectorNavigate("https://example.com/next"),
          );
          await expect(combo).toContainText("All controllers (3)");
          await expect(panelPage.locator("#tree .badge")).toHaveCount(4);
        },
      );
    });
  });

  test("renders heading and summary", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedHeadingAndSummary(
        "Hotwire Inspector",
        "2 frames, 4 controllers",
      ),
    );
  });

  test("renders tree nodes with correct IDs", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedNodeIds([
        "main-frame",
        "nested-frame",
        "modal-controller",
        "modal-close",
        "sidebar-controller",
      ]),
    );
  });

  test("displays tag names for each node", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedTagNames([
        "turbo-frame",
        "turbo-frame",
        "div",
        "button",
        "div",
      ]),
    );
  });

  test("does not render internal generated IDs", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: internalIdScanResponse },
      withExpectedInternalIdsHidden(ID_PREFIX, "user-controller"),
    );
  });

  test("shows frame src attribute", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedFrameSrc("main-frame", "/main"),
    );
  });

  test("displays controller badges", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await withExpectedControllerBadges("main-frame", ["sidebar"])(
          panelPage,
        );
        await withExpectedControllerBadges("modal-controller", [
          "modal",
          "dropdown",
        ])(panelPage);
      },
    );
  });

  test("displays target badges", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedTargetBadges("modal-close", [
        "modal#closeButton",
        "modal#trigger",
        "dropdown#item",
      ]),
    );
  });

  test("renders nested tree structure", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedNestedTree("main-frame", "nested-frame", "modal-controller"),
    );
  });

  test("renders deeply nested tree structure", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: deepScanResponse },
      withExpectedDeepTree("4 frames, 3 controllers", [
        "level-1",
        "level-2",
        "level-3",
        "level-4",
        "level-5",
        "level-6",
        "level-7",
      ]),
    );
  });

  test("shows empty state for no elements", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: emptyScanResponse },
      withExpectedEmptyState("0 frames, 0 controllers"),
    );
  });

  test("shows error state when scan fails", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanError: "Connection failed" },
      withExpectedErrorState("Unable to read the inspected page"),
    );
  });

  test("refresh button triggers rescan", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponses: [emptyScanResponse, fixtureScanResponse] },
      expectRefreshRescans,
    );
  });

  test("renders the theme switcher next to refresh", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      expectThemeSwitcher,
    );
  });

  test("updates the panel theme from the switcher", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      expectThemeChanges,
    );
  });

  test("applies a persisted panel theme override", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse, persistedTheme: "dark" },
      withExpectedPersistedTheme("dark"),
    );
  });

  test("renders two tabs and shows the placeholder on the Turbo Events tab", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      expectTabsVisible,
    );
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      expectTurboEventsTabEmptyState,
    );
  });

  test("hovering and leaving a row sends highlight messages", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedHoverMessages("main-frame", [
        { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: "main-frame" },
        { type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE },
      ]),
    );
  });

  test("clicking a row inspects the selected element", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedClickInspects(
        "nested-frame",
        [
          { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: "nested-frame" },
          { type: CONTENT_INSPECT_MESSAGE_TYPE, id: "nested-frame" },
        ],
        ['inspect(document.querySelector("#mock"))'],
      ),
    );
  });

  test("clicking a controller badge opens the details panel", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedBadgeClickOpensDetailsPanel("modal-controller", "modal"),
    );
  });

  test("details panel stays open across refresh while the controller exists", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedDetailsPanelRefresh("modal-controller", "modal", {
        expectOpen: true,
      }),
    );
  });

  test("details panel closes on refresh when the controller is gone", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponses: [fixtureScanResponse, controllerRemovedScanResponse] },
      withExpectedDetailsPanelRefresh("modal-controller", "modal", {
        expectOpen: false,
      }),
    );
  });

  test("details panel stays pinned when the tree view scrolls", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: tallScanResponse },
      withExpectedDetailsPanelPinnedOnScroll("frame-0", "modal"),
    );
  });

  test("details panel renders collapsible sections", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedDetailsPanelSections("modal-controller", "modal", [
        "Values",
        "Targets",
        "Outlets",
      ]),
    );
  });

  test("clicking an outlet badge opens the details panel for the outlet controller", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        const detailsPanel = await openDetailsPanel(
          panelPage,
          "modal-controller",
          "modal",
        );

        const outletBadge = detailsPanel
          .locator(".details-panel-section")
          .nth(2)
          .locator(".element-name.badge");
        await expect(outletBadge).toHaveText("user-status");

        await outletBadge.click();

        await expect(detailsPanel.locator(".details-panel-title")).toHaveText(
          "user-status",
        );

        const messages = await getRecordedMessages(panelPage);
        const outletRequests = messages.filter(
          (m) => m.type === CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
        );

        expect(outletRequests.length).toBeGreaterThanOrEqual(2);
        expect(outletRequests[outletRequests.length - 1]).toEqual({
          type: CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE,
          id: "user-status-element",
          identifier: "user-status",
        });
      },
    );
  });

  test("details panel rows reveal their element in the Elements panel on icon click", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        const detailsPanel = await openDetailsPanel(
          panelPage,
          "modal-controller",
          "modal",
        );

        const targetRow = detailsPanel
          .locator(".details-panel-section")
          .nth(1)
          .locator(".node")
          .first();
        const outletRow = detailsPanel
          .locator(".details-panel-section")
          .nth(2)
          .locator(".node")
          .first();

        await panelPage.locator("h1").hover();
        await clearRecordedMessages(panelPage);

        await targetRow.hover();
        await targetRow.locator(".icon-btn").first().click();

        await outletRow.hover();
        await outletRow.locator(".icon-btn").first().click();

        const messages = await getRecordedMessages(panelPage);
        const evalCalls = await getRecordedEvalCalls(panelPage);

        expect(messages).toContainEqual({
          type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
          id: "modal-close",
        });
        expect(messages).toContainEqual({
          type: CONTENT_INSPECT_MESSAGE_TYPE,
          id: "modal-close",
        });
        expect(messages).toContainEqual({
          type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
          id: "user-status-element",
        });
        expect(messages).toContainEqual({
          type: CONTENT_INSPECT_MESSAGE_TYPE,
          id: "user-status-element",
        });

        // Each click reflects back through the content script mock, which
        // replies with success: true / selector: "#mock" by default. The
        // important regression signal is the key id passed to the inspect
        // message — that's what was silently empty before.
        expect(evalCalls).toHaveLength(2);
        expect(evalCalls[0]).toBe('inspect(document.querySelector("#mock"))');
        expect(evalCalls[1]).toBe('inspect(document.querySelector("#mock"))');
      },
    );
  });

  test("details panel shows the controller's Stimulus values", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      withExpectedDetailsPanelValues("modal-controller", "modal"),
    );
  });

  test("details panel shows a note when the controller declares no values", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      {
        scanResponse: fixtureScanResponse,
        valuesResponse: { success: true, values: [] },
      },
      withExpectedDetailsPanelValuesNote(
        "modal-controller",
        "modal",
        "No values declared.",
      ),
    );
  });

  test("details panel shows an error when values cannot be read", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      {
        scanResponse: fixtureScanResponse,
        valuesResponse: { success: false, error: "Controller not found" },
      },
      withExpectedDetailsPanelValuesNote(
        "modal-controller",
        "modal",
        "Controller not found",
      ),
    );
  });

  test("double-clicking a row toggles node children visibility", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      expectDoubleClickTogglesNodeChildren,
    );
  });

  test("live-updates values when a values-changed push arrives", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        const detailsPanel = await openDetailsPanel(
          panelPage,
          "modal-controller",
          "modal",
        );

        const valuesContent = detailsPanel
          .locator(".details-panel-section-content")
          .first();
        const rows = valuesContent.locator(".value-row");
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0).locator(".value-data")).toHaveText("Hello");

        const messages = await getRecordedMessages(panelPage);
        expect(messages).toContainEqual({
          type: CONTENT_WATCH_VALUES_MESSAGE_TYPE,
          id: "modal-controller",
          identifier: "modal",
        });

        await simulateValuesChanged(panelPage, {
          type: VALUES_CHANGED_PUSH_TYPE,
          id: "modal-controller",
          identifier: "modal",
          values: [
            {
              name: "title",
              type: "string",
              value: "Updated",
              defaultValue: "",
              hasValue: true,
            },
            {
              name: "count",
              type: "number",
              value: "99",
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

        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0).locator(".value-data")).toHaveText("Updated");
        await expect(rows.nth(1).locator(".value-data")).toHaveText("99");
      },
    );
  });

  test("unwatches when the details panel closes", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        const detailsPanel = panelPage.locator("#details-panel");
        const badge = panelPage
          .locator(".node-row")
          .filter({ hasText: "modal-controller" })
          .first()
          .locator(".badge")
          .filter({ hasText: "modal" })
          .first();
        await badge.click();
        await expect(detailsPanel).toBeVisible();

        await clearRecordedMessages(panelPage);

        await detailsPanel.locator(".details-panel-close").click();
        await expect(detailsPanel).toBeHidden();

        const messages = await getRecordedMessages(panelPage);
        expect(messages).toContainEqual({
          type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
        });
      },
    );
  });

  test("refreshes the tree when a tree-changed push arrives", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponses: [emptyScanResponse, fixtureScanResponse] },
      async (panelPage) => {
        await expect(panelPage.locator("#summary")).toHaveText(
          "0 frames, 0 controllers",
        );
        await expect(panelPage.locator("#empty-state")).toBeVisible();

        await simulateTreeChanged(panelPage, {
          type: TREE_CHANGED_PUSH_TYPE,
        });

        await expect(panelPage.locator("#summary")).toHaveText(
          "2 frames, 4 controllers",
        );
        await expect(panelPage.locator("#empty-state")).toBeHidden();
      },
    );
  });

  test("filters retained Turbo events", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label[for='tab-events']").click();
        const combo = panelPage.getByRole("combobox", {
          name: "Filter events",
        });
        const dropdown = panelPage.locator("#panel-events .ts-dropdown");
        await expect(combo).toContainText(
          `All events (${TURBO_EVENT_NAMES.length})`,
        );
        await expect(panelPage.locator(".events-no-matches")).toBeHidden();
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          name: "turbo:load",
        });
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          name: "turbo:visit",
        });
        await combo.click();
        await expect(dropdown.locator(".option")).toHaveText(
          [...TURBO_EVENT_NAMES].sort(),
        );
        await dropdown.getByRole("button", { name: "Clear all" }).click();
        await expect(panelPage.locator(".events-no-matches")).toBeVisible();
        await dropdown.locator('.option[data-value="turbo:load"]').click();
        await expect(
          panelPage.locator(".event-box:visible .event-name"),
        ).toHaveText(["turbo:load"]);
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          name: "turbo:visit",
        });
        await expect(panelPage.locator(".event-box")).toHaveCount(3);
        await expect(panelPage.locator(".event-box:visible")).toHaveCount(1);
      },
    );
  });

  test("persists and shares the selection", async ({ browserName, page }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    test.skip(
      !adapter.capabilities.loadsExtension,
      "Requires real extension storage",
    );
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label[for='tab-events']").click();
        const combo = panelPage.getByRole("combobox", {
          name: "Filter events",
        });
        const dropdown = panelPage.locator("#panel-events .ts-dropdown");
        await expect(combo).toContainText(
          `All events (${TURBO_EVENT_NAMES.length})`,
        );
        await combo.click();
        await dropdown.getByRole("button", { name: "Clear all" }).click();
        await dropdown.locator('.option[data-value="turbo:load"]').click();
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          name: "turbo:load",
        });
        const other = await panelPage.context().newPage();
        await addMockPanelApis(other, { scanResponse: fixtureScanResponse });
        await other.goto(panelPage.url());
        await other.locator("label[for='tab-events']").click();
        const otherCombo = other.getByRole("combobox", {
          name: "Filter events",
        });
        await expect(otherCombo).toContainText(
          `1 of ${TURBO_EVENT_NAMES.length} events`,
        );
        await panelPage.reload();
        await panelPage.locator("label[for='tab-events']").click();
        await expect(combo).toContainText(
          `1 of ${TURBO_EVENT_NAMES.length} events`,
        );
        await expect(panelPage.locator(".events-empty")).toBeVisible();
        await expect(panelPage.locator(".event-box")).toHaveCount(0);

        await combo.click();
        await dropdown.getByRole("button", { name: "Clear all" }).click();
        await expect(otherCombo).toContainText("No events selected");
        await panelPage.reload();
        await panelPage.locator("label[for='tab-events']").click();
        await expect(combo).toContainText("No events selected");
        await combo.click();
        await dropdown.getByRole("button", { name: "Select all" }).click();
        await expect(otherCombo).toContainText(
          `All events (${TURBO_EVENT_NAMES.length})`,
        );
        await other.close();
      },
    );
  });

  test("turbo event reveal icon triggers an element inspect message", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();

        await simulateTurboEvent(panelPage, turboEventsFixturePush);

        const reveal = panelPage.locator(
          "#panel-events .event-box .event-reveal",
        );
        await expect(reveal).toHaveCount(1);

        await clearRecordedMessages(panelPage);
        await reveal.click();

        const messages = await getRecordedMessages(panelPage);
        const evalCalls = await getRecordedEvalCalls(panelPage);

        expect(messages).toContainEqual({
          type: CONTENT_INSPECT_MESSAGE_TYPE,
          id: "main-frame",
        });
        // Default inspect mock returns #mock on success, so the eval
        // call reflects the selector response rendered by the bridge.
        expect(evalCalls).toEqual(['inspect(document.querySelector("#mock"))']);
      },
    );
  });

  test("turbo event reveal icon shows a warning when the target is gone", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      {
        scanResponse: fixtureScanResponse,
        inspectResponses: [{ success: false, selector: null }],
      },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();

        await simulateTurboEvent(panelPage, turboEventsFixturePush);

        const reveal = panelPage.locator(
          "#panel-events .event-box .event-reveal",
        );
        await expect(reveal).toHaveCount(1);

        await reveal.click();

        const notice = panelPage.locator(
          ".status-notice[data-status-tone-value='warning']",
        );
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(
          "Element no longer exists so it can't be revealed.",
        );
      },
    );
  });

  test("turbo event attributes render immediately", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();

        await simulateTurboEvent(panelPage, turboEventsWithDetailsFixturePush);

        const details = panelPage
          .locator("#panel-events .event-box .event-box-details")
          .first();
        await expect(details).toHaveCount(1);
        await expect(details).toBeVisible();
        await expect(details.locator("summary")).toHaveCount(0);

        const key = details.locator(".event-box-details-key").first();
        const value = details.locator(".event-box-details-value").first();
        await expect(key).toHaveText("url");
        await expect(value).toHaveText("https://app.test/dashboard");
      },
    );
  });

  test("switches between controller and large payload details", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        const markup = "<p>Hello</p>\n".repeat(20);
        await panelPage.locator("label.tab[for='tab-events']").click();
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          targetId: null,
          details: { html: markup },
        });
        const values = panelPage.locator(
          "#panel-events .event-box-details-value",
        );
        await values.locator(".event-more").click();
        const panel = panelPage.locator("#details-panel");
        await expect(panel.locator(".event-attribute-content")).toHaveText(
          markup,
        );
        await panelPage.locator("label.tab[for='tab-elements']").click();
        await panelPage
          .locator(".node-row")
          .filter({ hasText: "modal-controller" })
          .first()
          .locator(".badge")
          .filter({ hasText: "modal" })
          .first()
          .click();
        await expect(panel.locator(".details-panel-title")).toHaveText("modal");
        await expect(panel.locator(".details-panel-store")).toBeVisible();
        await expect(panel.locator(".event-attribute-content")).toBeEmpty();
        await expect(panelPage.locator(".event-box.selected")).toHaveCount(0);
        await clearRecordedMessages(panelPage);
        await panelPage.locator("label.tab[for='tab-events']").click();
        await values.locator(".event-more").click();
        await expect(panel.locator(".event-attribute-content")).toHaveText(
          markup,
        );
        await expect(panel.locator(".details-panel-store")).toBeHidden();
        expect(await getRecordedMessages(panelPage)).toContainEqual({
          type: CONTENT_UNWATCH_VALUES_MESSAGE_TYPE,
        });
      },
    );
  });

  test("capped HTML shows its notice only at the bottom of the expanded view", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();
        const html = "<p>captured HTML</p>\n".repeat(4000).slice(0, 65536);
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          targetId: null,
          details: { html, htmlOriginalLength: "80000" },
        });
        const row = panelPage.locator("#panel-events .event-box");
        await expect(row.locator("dt")).toHaveText(["html"]);
        await row.locator(".event-more").click();
        const panel = panelPage.locator("#details-panel");
        const notice = panel.locator(".event-attribute-notice");
        await expect(panel.locator(".event-attribute-content")).toHaveText(
          html,
        );
        await expect(notice).toHaveText(
          "Showing 65,536 of 80,000 UTF-16 code units. The remaining HTML was omitted for performance.",
        );
        await expect(notice).not.toBeInViewport();
        await notice.scrollIntoViewIfNeeded();
        await expect(notice).toBeInViewport();
      },
    );
  });

  test("full frame HTML and omission errors render as inert text through bursts and clear", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);
    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();
        const requests = [];
        panelPage.on("request", (request) => requests.push(request.url()));
        const markup =
          '<turbo-frame><script>window.capturedScriptRan=true</script><img src="https://example.invalid/captured-image">' +
          "x".repeat(65000) +
          "</turbo-frame>";
        const pushDetails = (details) =>
          simulateTurboEvent(panelPage, {
            ...turboEventsFixturePush,
            targetId: null,
            details,
          });
        await pushDetails({ html: markup });
        const values = panelPage.locator(
          "#panel-events .event-box-details-value",
        );
        await expect(values).toHaveText([markup.slice(0, 140) + "... more"]);
        await values.locator(".event-more").click();
        const panel = panelPage.locator("#details-panel");
        await expect(panel).toHaveClass(/open/);
        await expect(panel.locator(".details-panel-title")).toHaveText(
          `${turboEventsFixturePush.name} — html`,
        );
        await expect(panel.locator(".event-attribute-content")).toHaveText(
          markup,
        );
        await expect(panel.locator(".details-panel-store")).toBeHidden();
        await expect(
          panel.locator(".details-panel-section").first(),
        ).toBeHidden();
        await expect(panelPage.locator(".event-box.selected")).toHaveCount(1);
        await expect(values).toHaveCSS("white-space", "pre-wrap");
        await expect(
          panelPage.locator(
            "#panel-events .event-box-details script, #panel-events .event-box-details img",
          ),
        ).toHaveCount(0);
        expect(
          await panelPage.evaluate(() => window.capturedScriptRan),
        ).toBeUndefined();
        const error = "HTML omitted: exceeds 65536 code units";
        await pushDetails({ htmlError: error });
        await expect(values).toHaveText([
          markup.slice(0, 140) + "... more",
          error,
        ]);
        for (let index = 0; index < 500; index++) {
          await pushDetails({ html: markup });
        }
        await expect(panelPage.locator("#panel-events .event-box")).toHaveCount(
          500,
        );
        await expect(
          panelPage.locator("#panel-events .events-dropped-notice"),
        ).toContainText("2");
        await expect(panel).not.toHaveClass(/open/);
        await expect(panel.locator(".event-attribute-content")).toBeEmpty();
        await values.last().locator(".event-more").click();
        await expect(panel).toHaveClass(/open/);
        expect(requests).toEqual([]);
        await panelPage.locator("#panel-events .events-clear").click();
        await expect(panelPage.locator("#panel-events .event-box")).toHaveCount(
          0,
        );
        await expect(values).toHaveCount(0);
        await expect(panel).not.toHaveClass(/open/);
      },
    );
  });

  test("turbo event with empty details does not render a details block", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();

        await simulateTurboEvent(panelPage, turboEventsFixturePush);

        await expect(
          panelPage.locator("#panel-events .event-box .event-box-details"),
        ).toHaveCount(0);
      },
    );
  });

  test("clearing turbo events empties the list and reveals the placeholder", async ({
    browserName,
    page,
  }) => {
    const adapter = adaptersByBrowserName[browserName];
    test.skip(!adapter, `${browserName} does not have a panel adapter`);

    await withPanel(
      adapter,
      page,
      { scanResponse: fixtureScanResponse },
      async (panelPage) => {
        await panelPage.locator("label.tab[for='tab-events']").click();

        await simulateTurboEvent(panelPage, turboEventsFixturePush);
        await simulateTurboEvent(panelPage, {
          ...turboEventsFixturePush,
          name: "turbo:visit",
        });

        await expect(panelPage.locator("#panel-events .event-box")).toHaveCount(
          2,
        );

        await panelPage.locator("#panel-events .events-clear").click();

        await expect(panelPage.locator("#panel-events .event-box")).toHaveCount(
          0,
        );
        await expect(
          panelPage.locator("#panel-events .events-list"),
        ).toBeHidden();
        await expect(
          panelPage.locator("#panel-events .events-empty"),
        ).toBeVisible();
        await expect(
          panelPage.locator("#panel-events .events-empty"),
        ).toHaveText("No Turbo events yet");
      },
    );
  });
});
