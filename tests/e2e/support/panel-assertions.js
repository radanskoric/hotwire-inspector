import { expect } from "@playwright/test";
import {
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_SCAN_MESSAGE_TYPE,
  CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
} from "../../../lib/constants.js";

export async function addMockPanelApis(
  page,
  { scanResponse, scanError, scanResponses, persistedTheme } = {},
) {
  await page.addInitScript(
    ({
      scanResponse,
      scanError,
      scanResponses,
      persistedTheme,
      scanMessageType,
      storeControllerMessageType,
    }) => {
      globalThis.browser ??= {};
      globalThis.browser.runtime ??= {};
      globalThis.chrome ??= globalThis.browser;
      globalThis.__hotwireInspectorMessages = [];
      globalThis.__hotwireInspectorEvalCalls = [];

      if (persistedTheme) {
        localStorage.setItem("hotwire-inspector.theme", persistedTheme);
      }

      browser.devtools = {
        inspectedWindow: {
          tabId: 1,
          eval: (code, callback) => {
            globalThis.__hotwireInspectorEvalCalls.push(code);
            callback?.({ success: true, name: "temp1" });
          },
        },
      };

      let scanCallCount = 0;

      browser.runtime.sendMessage = (relayMessage) => {
        const message = relayMessage.message;

        globalThis.__hotwireInspectorMessages.push(message);

        if (message.type === scanMessageType) {
          if (scanError) {
            return Promise.reject(new Error(scanError));
          }

          if (scanResponses) {
            const response =
              scanResponses[scanCallCount] ??
              scanResponses[scanResponses.length - 1];
            scanCallCount++;
            return Promise.resolve(response);
          }

          return Promise.resolve(scanResponse);
        }

        if (message.type === storeControllerMessageType) {
          return Promise.resolve({
            success: true,
            name: "temp1",
            identifier: message.identifier,
          });
        }

        return Promise.resolve({ success: true, selector: "#mock" });
      };
      globalThis.chrome = globalThis.browser;
    },
    {
      scanResponse,
      scanError,
      scanResponses,
      persistedTheme,
      scanMessageType: CONTENT_SCAN_MESSAGE_TYPE,
      storeControllerMessageType: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
    },
  );
}

export async function getRecordedMessages(panelPage) {
  return panelPage.evaluate(() => globalThis.__hotwireInspectorMessages);
}

export async function clearRecordedMessages(panelPage) {
  await panelPage.evaluate(() => {
    globalThis.__hotwireInspectorMessages = [];
  });
}

export async function getRecordedEvalCalls(panelPage) {
  return panelPage.evaluate(() => globalThis.__hotwireInspectorEvalCalls);
}

export function withExpectedHeadingAndSummary(heading, summary) {
  return async (panelPage) => {
    await expect(panelPage.locator("h1")).toHaveText(heading);
    await expect(panelPage.locator("#summary")).toHaveText(summary);
  };
}

export function withExpectedNodeIds(expectedIds) {
  return async (panelPage) => {
    await expect(panelPage.locator(".node-id")).toHaveText(expectedIds);
  };
}

export function withExpectedTagNames(expectedTagNames) {
  return async (panelPage) => {
    await expect(panelPage.locator(".node-kind")).toHaveText(expectedTagNames);
  };
}

export function withExpectedInternalIdsHidden(internalIdPrefix, visibleId) {
  return async (panelPage) => {
    const nodeIds = await panelPage.locator(".node-id").allTextContents();
    expect(nodeIds).not.toContain(`${internalIdPrefix}-uuid-1`);
    expect(nodeIds).toContain(visibleId);
  };
}

export function withExpectedFrameSrc(nodeId, expectedSrc) {
  return async (panelPage) => {
    const nodeRow = panelPage
      .locator(".node-row")
      .filter({ hasText: nodeId })
      .first();
    const src = nodeRow.locator(".node-src");

    await expect(src).toBeVisible();
    await expect(src).toHaveText(expectedSrc);
  };
}

export function withExpectedControllerBadges(nodeId, expectedBadges) {
  return async (panelPage) => {
    const nodeRow = panelPage
      .locator(".node-row")
      .filter({ hasText: nodeId })
      .first();

    await expect(nodeRow.locator(".badge")).toHaveText(expectedBadges);
  };
}

export function withExpectedTargetBadges(nodeId, expectedBadges) {
  return async (panelPage) => {
    const nodeRow = panelPage
      .locator(".node-row")
      .filter({ hasText: nodeId })
      .first();

    await expect(nodeRow.locator(".target-badge")).toHaveText(expectedBadges);
  };
}

export function withExpectedNestedTree(parentId, childId, grandchildId) {
  return async (panelPage) => {
    const parentChildren = panelPage
      .locator(".node")
      .filter({ hasText: parentId })
      .first()
      .locator("> .node-children");
    await expect(parentChildren).toBeVisible();
    await expect(parentChildren.locator(".node-id").first()).toHaveText(
      childId,
    );

    const childChildren = parentChildren
      .locator(".node")
      .filter({ hasText: childId })
      .first()
      .locator("> .node-children");
    await expect(childChildren.locator(".node-id").first()).toHaveText(
      grandchildId,
    );
  };
}

export function withExpectedDeepTree(summaryText, levelIds) {
  return async (panelPage) => {
    await expect(panelPage.locator("#summary")).toHaveText(summaryText);
    await expect(panelPage.locator(".node-id")).toHaveText(levelIds);

    let children = panelPage
      .locator(".node")
      .filter({ hasText: levelIds[0] })
      .first()
      .locator("> .node-children");

    for (let i = 1; i < levelIds.length; i++) {
      await expect(children).toBeVisible();
      await expect(
        children.locator("> .node > .node-row .node-id").first(),
      ).toHaveText(levelIds[i]);
      children = children
        .locator("> .node")
        .first()
        .locator("> .node-children");
    }
  };
}

export function withExpectedEmptyState(summaryText) {
  return async (panelPage) => {
    await expect(panelPage.locator("#empty-state")).toBeVisible();
    await expect(panelPage.locator("#tree")).toBeHidden();
    await expect(panelPage.locator("#summary")).toHaveText(summaryText);
  };
}

export function withExpectedErrorState(errorMessage) {
  return async (panelPage) => {
    await expect(panelPage.locator("#summary")).toHaveText(errorMessage);
  };
}

export async function expectRefreshRescans(panelPage) {
  await expect(panelPage.locator("#summary")).toHaveText(
    "0 frames, 0 controllers",
  );

  await panelPage.locator("#refresh-button").click();

  await expect(panelPage.locator("#summary")).toHaveText(
    "2 frames, 4 controllers",
  );
}

export async function expectThemeSwitcher(panelPage) {
  const actions = panelPage.locator(".toolbar-actions");
  const themeSelect = actions.locator("#theme-select");

  await expect(themeSelect).toBeVisible();
  await expect(themeSelect.locator("option")).toHaveText([
    "System",
    "Light",
    "Dark",
  ]);
  await expect(actions.locator("#refresh-button")).toBeVisible();
}

export async function expectThemeChanges(panelPage) {
  const themeSelect = panelPage.locator("#theme-select");

  await expect(themeSelect).toHaveValue("system");
  await expect(panelPage.locator("html")).not.toHaveAttribute(
    "data-theme",
    /.+/,
  );

  await themeSelect.selectOption("dark");
  await expect(panelPage.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeSelect).toHaveValue("dark");

  await themeSelect.selectOption("light");
  await expect(panelPage.locator("html")).toHaveAttribute(
    "data-theme",
    "light",
  );
  await expect(themeSelect).toHaveValue("light");

  await themeSelect.selectOption("system");
  await expect(panelPage.locator("html")).not.toHaveAttribute(
    "data-theme",
    /.+/,
  );
  await expect(themeSelect).toHaveValue("system");
}

export function withExpectedPersistedTheme(expectedTheme) {
  return async (panelPage) => {
    await expect(panelPage.locator("#theme-select")).toHaveValue(expectedTheme);
    await expect(panelPage.locator("html")).toHaveAttribute(
      "data-theme",
      expectedTheme,
    );
  };
}

export function withExpectedHoverMessages(nodeId, expectedMessages) {
  return async (panelPage) => {
    const nodeRow = panelPage
      .locator(".node-row")
      .filter({ hasText: nodeId })
      .first();

    await panelPage.locator("h1").hover();
    await clearRecordedMessages(panelPage);
    await nodeRow.hover();
    await panelPage.locator("h1").hover();

    const messages = await getRecordedMessages(panelPage);

    expect(messages).toEqual(expectedMessages);
  };
}

export function withExpectedClickInspects(
  nodeId,
  expectedMessages,
  expectedEvalCall,
) {
  return async (panelPage) => {
    const nodeRow = panelPage
      .locator(".node-row")
      .filter({ hasText: nodeId })
      .first();
    const inspectIcon = nodeRow.locator(".icon-btn");

    await panelPage.locator("h1").hover();
    await clearRecordedMessages(panelPage);
    await nodeRow.hover();
    await inspectIcon.click();

    const messages = await getRecordedMessages(panelPage);
    const evalCalls = await getRecordedEvalCalls(panelPage);

    expect(messages).toEqual(expectedMessages);
    expect(evalCalls).toEqual(expectedEvalCall);
  };
}

async function openDetailsPanel(panelPage, nodeId, controllerIdentifier) {
  const detailsPanel = panelPage.locator("#details-panel");
  const badge = panelPage
    .locator(".node-row")
    .filter({ hasText: nodeId })
    .first()
    .locator(".badge")
    .filter({ hasText: controllerIdentifier })
    .first();

  await badge.click();
  await expect(detailsPanel).toBeVisible();

  return detailsPanel;
}

export function withExpectedBadgeClickOpensDetailsPanel(
  nodeId,
  controllerIdentifier,
) {
  return async (panelPage) => {
    const detailsPanel = panelPage.locator("#details-panel");

    await expect(detailsPanel).toBeHidden();
    await clearRecordedMessages(panelPage);
    await openDetailsPanel(panelPage, nodeId, controllerIdentifier);

    await expect(detailsPanel.locator(".details-panel-title")).toHaveText(
      controllerIdentifier,
    );

    const storeButton = detailsPanel.locator(
      ".details-panel-title + .details-panel-store",
    );
    await expect(storeButton).toBeVisible();
    await expect(storeButton).toHaveAttribute(
      "title",
      "Store as global variable",
    );
    await expect(storeButton.locator(".icon")).toHaveAttribute(
      "src",
      "/icons/command-line.svg",
    );

    // Clicking the badge alone only highlights the row (via hover); storing
    // now happens from the panel link.
    expect(await getRecordedMessages(panelPage)).toEqual([
      { type: CONTENT_HIGHLIGHT_MESSAGE_TYPE, id: nodeId },
    ]);

    await detailsPanel.locator(".details-panel-store").click();

    await expect
      .poll(() => getRecordedMessages(panelPage))
      .toContainEqual({
        type: CONTENT_STORE_CONTROLLER_MESSAGE_TYPE,
        id: nodeId,
        identifier: controllerIdentifier,
      });

    await detailsPanel.locator(".details-panel-close").click();
    await expect(detailsPanel).toBeHidden();
  };
}

export function withExpectedDetailsPanelRefresh(
  nodeId,
  controllerIdentifier,
  { expectOpen },
) {
  return async (panelPage) => {
    const detailsPanel = await openDetailsPanel(
      panelPage,
      nodeId,
      controllerIdentifier,
    );

    await panelPage.locator("#refresh-button").click();
    await expect
      .poll(async () =>
        (await getRecordedMessages(panelPage)).filter(
          (message) => message.type === CONTENT_SCAN_MESSAGE_TYPE,
        ),
      )
      .toHaveLength(2);

    if (expectOpen) {
      await expect(detailsPanel).toBeVisible();
      await expect(detailsPanel.locator(".details-panel-title")).toHaveText(
        controllerIdentifier,
      );
    } else {
      await expect(detailsPanel).toBeHidden();
    }
  };
}

export function withExpectedDetailsPanelSections(
  nodeId,
  controllerIdentifier,
  expectedSections,
) {
  return async (panelPage) => {
    const detailsPanel = await openDetailsPanel(
      panelPage,
      nodeId,
      controllerIdentifier,
    );

    const sections = detailsPanel.locator(".details-panel-section");
    await expect(sections.locator("> summary")).toHaveText(expectedSections);

    for (const section of await sections.all()) {
      await expect(
        section.locator(".details-panel-section-content"),
      ).toHaveText("TODO");
    }

    // Sections collapse and expand natively via their summary.
    const firstSection = sections.first();
    const firstContent = firstSection.locator(".details-panel-section-content");
    await expect(firstSection).toHaveAttribute("open", "");

    await firstSection.locator("> summary").click();
    expect(await firstSection.getAttribute("open")).toBeNull();
    await expect(firstContent).toBeHidden();

    await firstSection.locator("> summary").click();
    await expect(firstSection).toHaveAttribute("open", "");
    await expect(firstContent).toBeVisible();
  };
}

export function withExpectedDetailsPanelPinnedOnScroll(
  nodeId,
  controllerIdentifier,
) {
  return async (panelPage) => {
    const detailsPanel = await openDetailsPanel(
      panelPage,
      nodeId,
      controllerIdentifier,
    );

    const beforeScroll = await detailsPanel.boundingBox();

    const treeArea = panelPage.locator("main");
    await treeArea.evaluate((element) =>
      element.scrollTo(0, element.scrollHeight),
    );

    // Sanity check: the tree area actually scrolled.
    expect(
      await treeArea.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);

    const afterScroll = await detailsPanel.boundingBox();
    expect(afterScroll.y).toBe(beforeScroll.y);
    await expect(detailsPanel).toBeVisible();
  };
}

export async function expectDoubleClickTogglesNodeChildren(panelPage) {
  const mainFrameNode = panelPage
    .locator(".node")
    .filter({ hasText: "main-frame" })
    .first();
  const mainFrameRow = mainFrameNode.locator("> .node-row");
  const mainFrameChildren = mainFrameNode.locator("> .node-children");
  const mainFrameToggle = mainFrameRow.locator(".node-toggle");
  const sidebarControllerToggle = panelPage
    .locator(".node-row")
    .filter({ hasText: "sidebar-controller" })
    .first()
    .locator(".node-toggle");

  // Initial state: children are visible (expanded by default)
  await expect(mainFrameChildren).toBeVisible();
  await expect(mainFrameToggle).toBeVisible();
  await expect(sidebarControllerToggle).toBeHidden();
  await expect(mainFrameNode).toHaveClass(/expanded/);

  // Double-click to collapse
  await mainFrameRow.dblclick();
  await expect(mainFrameChildren).toBeHidden();
  await expect(mainFrameNode).not.toHaveClass(/expanded/);

  // Double-click again to expand
  await mainFrameRow.dblclick();
  await expect(mainFrameChildren).toBeVisible();
  await expect(mainFrameNode).toHaveClass(/expanded/);

  await mainFrameToggle.click();
  await expect(mainFrameChildren).toBeHidden();
  await expect(mainFrameNode).not.toHaveClass(/expanded/);
}
