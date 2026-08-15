// @vitest-environment happy-dom

import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DetailsPanelController } from "../../lib/panel/controllers/details-panel-controller.js";
import {
  PANEL_BRIDGE_PROPERTY,
  SHOW_CONTROLLER_DETAILS_EVENT,
  SCAN_REFRESHED_EVENT,
} from "../../lib/constants.js";

describe("DetailsPanelController", () => {
  let application;
  let calls;
  let panel;

  beforeEach(async () => {
    calls = [];
    document.body.innerHTML = `
      <template id="notice-template">
        <div class="status-notice" data-controller="status" role="status" aria-live="polite">
          <span slot="text"></span>
        </div>
      </template>
      <aside
        id="details-panel"
        data-controller="details-panel"
        data-action="${SHOW_CONTROLLER_DETAILS_EVENT}@window->details-panel#show ${SCAN_REFRESHED_EVENT}@window->details-panel#refresh keydown.esc@window->details-panel#close"
        aria-label="Controller details"
      >
        <h2 data-details-panel-target="identifier"></h2>
        <button type="button" class="details-panel-close" data-action="click->details-panel#close">Close</button>
        <button type="button" class="details-panel-store" data-action="click->details-panel#storeInConsole">Store in console</button>
      </aside>
    `;
    document[PANEL_BRIDGE_PROPERTY] = {
      sendToInspectedTab(message) {
        calls.push(["sendToInspectedTab", message]);
        return Promise.resolve("sent");
      },
      inspectNode(id) {
        calls.push(["inspectNode", id]);
        return Promise.resolve("inspected");
      },
      storeControllerNode(id, identifier) {
        calls.push(["storeControllerNode", id, identifier]);
        return Promise.resolve({ success: true, name: "temp1", identifier });
      },
    };
    application = Application.start();
    application.register("details-panel", DetailsPanelController);
    panel = document.getElementById("details-panel");

    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
    document.body.innerHTML = "";
    delete document[PANEL_BRIDGE_PROPERTY];
  });

  function showDetails(detail = { nodeId: "frame-1", identifier: "modal" }) {
    window.dispatchEvent(
      new CustomEvent(SHOW_CONTROLLER_DETAILS_EVENT, { detail }),
    );
  }

  function scanRefreshed(items) {
    window.dispatchEvent(
      new CustomEvent(SCAN_REFRESHED_EVENT, { detail: { items } }),
    );
  }

  function identifierText() {
    return panel.querySelector("[data-details-panel-target='identifier']")
      .textContent;
  }

  function clickStoreButton() {
    panel
      .querySelector(".details-panel-store")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("opens the panel with the controller details when a show event is dispatched", async () => {
    showDetails();
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(true);
    expect(identifierText()).toBe("modal");
    expect(panel.dataset.detailsPanelNodeIdValue).toBe("frame-1");
    expect(panel.dataset.detailsPanelIdentifierValue).toBe("modal");
    expect(calls).toEqual([]);
  });

  it("closes the panel when the close button is clicked", async () => {
    showDetails();
    await Promise.resolve();

    panel
      .querySelector(".details-panel-close")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("closes the panel when Escape is pressed", async () => {
    showDetails();
    await Promise.resolve();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("stores the shown controller instance when the store button is clicked", async () => {
    showDetails();
    await Promise.resolve();

    clickStoreButton();
    await Promise.resolve();

    expect(calls).toEqual([["storeControllerNode", "frame-1", "modal"]]);

    const statusElement = document.querySelector(".status-notice");
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain(
      "modal controller instance stored as temp1",
    );
  });

  it("stores without rendering feedback when the notice template is unavailable", async () => {
    document.getElementById("notice-template").remove();
    showDetails();
    await Promise.resolve();

    clickStoreButton();
    await Promise.resolve();

    expect(document.querySelector(".status-notice")).toBeNull();
    expect(calls).toEqual([["storeControllerNode", "frame-1", "modal"]]);
  });

  it("shows error feedback in status element on failed controller storage", async () => {
    document[PANEL_BRIDGE_PROPERTY].storeControllerNode = (id, identifier) => {
      calls.push(["storeControllerNode", id, identifier]);
      return Promise.resolve({ success: false, error: "Controller not found" });
    };
    showDetails();
    await Promise.resolve();

    clickStoreButton();
    await Promise.resolve();

    const statusElement = document.querySelector(".status-notice");
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain("Controller not found");
  });

  it("shows generic error message when storage fails without specific error", async () => {
    document[PANEL_BRIDGE_PROPERTY].storeControllerNode = (id, identifier) => {
      calls.push(["storeControllerNode", id, identifier]);
      return Promise.resolve({ success: false });
    };
    showDetails();
    await Promise.resolve();

    clickStoreButton();
    await Promise.resolve();

    const statusElement = document.querySelector(".status-notice");
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain("Controller storage failed");
  });

  it("keeps the panel open when a scan refresh still finds the controller", async () => {
    showDetails();
    await Promise.resolve();

    scanRefreshed([
      { id: "frame-1", tagName: "div", controllers: ["modal", "dropdown"] },
    ]);
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(true);
    expect(identifierText()).toBe("modal");
  });

  it("closes the panel when a scan refresh no longer contains the element", async () => {
    showDetails();
    await Promise.resolve();

    scanRefreshed([]);
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("closes the panel when a scan refresh finds the element without the controller", async () => {
    showDetails();
    await Promise.resolve();

    scanRefreshed([
      { id: "frame-1", tagName: "div", controllers: ["dropdown"] },
    ]);
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("closes the panel when a scan refresh finds the element without controllers", async () => {
    showDetails();
    await Promise.resolve();

    scanRefreshed([{ id: "frame-1", tagName: "div" }]);
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("ignores scan refreshes while the panel is closed", async () => {
    scanRefreshed([{ id: "frame-1", tagName: "div", controllers: ["modal"] }]);
    await Promise.resolve();

    expect(panel.classList.contains("open")).toBe(false);
    expect(identifierText()).toBe("");
  });
});
