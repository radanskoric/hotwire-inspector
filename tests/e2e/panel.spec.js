import { test } from "@playwright/test";
import { chromiumAdapter } from "./adapters/chromium-adapter.js";
import { firefoxAdapter } from "./adapters/firefox-adapter.js";
import {
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_INSPECT_MESSAGE_TYPE,
  ID_PREFIX,
} from "../../lib/constants.js";
import {
  controllerRemovedScanResponse,
  deepScanResponse,
  emptyScanResponse,
  fixtureScanResponse,
  internalIdScanResponse,
  tallScanResponse,
} from "./support/panel-fixtures.js";
import {
  expectDoubleClickTogglesNodeChildren,
  expectRefreshRescans,
  expectThemeChanges,
  expectThemeSwitcher,
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
});
