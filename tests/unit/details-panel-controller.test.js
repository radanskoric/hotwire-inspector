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
        data-action="${SHOW_CONTROLLER_DETAILS_EVENT}@document->details-panel#show ${SCAN_REFRESHED_EVENT}@document->details-panel#refresh keydown.esc@window->details-panel#close"
        aria-label="Controller details"
      >
        <header class="details-panel-header">
          <h2 class="details-panel-title" data-details-panel-target="identifier"></h2>
          <button type="button" class="details-panel-store" data-action="click->details-panel#storeInConsole" title="Store as global variable" aria-label="Store as global variable">
            <img src="/icons/command-line.svg" class="icon" alt="" aria-hidden="true" />
          </button>
          <button type="button" class="details-panel-close" data-action="click->details-panel#close" aria-label="Close details">×</button>
        </header>
        <div class="details-panel-body">
          <details class="details-panel-section" open>
            <summary>Values</summary>
            <div class="details-panel-section-content" data-details-panel-target="values"></div>
          </details>
          <details class="details-panel-section" open>
            <summary>Targets</summary>
            <div class="details-panel-section-content">TODO</div>
          </details>
          <details class="details-panel-section" open>
            <summary>Outlets</summary>
            <div class="details-panel-section-content">TODO</div>
          </details>
        </div>
      </aside>
    `;
    document[PANEL_BRIDGE_PROPERTY] = {
      storeControllerNode(id, identifier) {
        calls.push(["storeControllerNode", id, identifier]);
        return Promise.resolve({ success: true, name: "temp1", identifier });
      },
      controllerValues(id, identifier) {
        calls.push(["controllerValues", id, identifier]);
        return Promise.resolve({ success: true, values: [] });
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
    document.dispatchEvent(
      new CustomEvent(SHOW_CONTROLLER_DETAILS_EVENT, { detail }),
    );
  }

  function scanRefreshed(items) {
    document.dispatchEvent(
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
    expect(calls).toEqual([["controllerValues", "frame-1", "modal"]]);
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

    expect(calls).toEqual([
      ["controllerValues", "frame-1", "modal"],
      ["storeControllerNode", "frame-1", "modal"],
    ]);

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
    expect(calls).toEqual([
      ["controllerValues", "frame-1", "modal"],
      ["storeControllerNode", "frame-1", "modal"],
    ]);
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
    expect(calls).toEqual([]);
  });

  describe("values section", () => {
    function valuesContent() {
      return panel.querySelector("[data-details-panel-target='values']");
    }

    const sampleValues = [
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
      {
        name: "config",
        type: "object",
        value: '{"theme":"dark"}',
        defaultValue: {},
        hasValue: true,
      },
    ];

    function mockValuesResponse(response) {
      document[PANEL_BRIDGE_PROPERTY].controllerValues = (id, identifier) => {
        calls.push(["controllerValues", id, identifier]);
        return Promise.resolve(response);
      };
    }

    function mockValuesDeferred() {
      const pending = [];
      document[PANEL_BRIDGE_PROPERTY].controllerValues = (id, identifier) => {
        calls.push(["controllerValues", id, identifier]);
        return new Promise((resolve) => pending.push(resolve));
      };
      return pending;
    }

    it("shows a loading note while values are being fetched", () => {
      mockValuesDeferred();

      showDetails();

      expect(valuesContent().textContent).toBe("Loading…");
    });

    it("renders a row per value when the panel opens", async () => {
      mockValuesResponse({ success: true, values: sampleValues });

      showDetails();
      await Promise.resolve();

      const rows = valuesContent().querySelectorAll(".value-row");
      expect(rows).toHaveLength(4);
      expect(rows[0].querySelector(".value-name").textContent).toBe("title");
      expect(rows[0].querySelector(".value-type").textContent).toBe("string");
      expect(rows[0].querySelector(".value-data").textContent).toBe("Greeting");
      expect(rows[0].classList.contains("value-row-unset")).toBe(false);
      expect(rows[3].querySelector(".value-data").textContent).toBe(
        '{"theme":"dark"}',
      );
    });

    it("formats typed object values as JSON (e.g. from a stale page script)", async () => {
      mockValuesResponse({
        success: true,
        values: [
          {
            name: "config",
            type: "object",
            value: { theme: "dark" },
            defaultValue: {},
            hasValue: true,
          },
        ],
      });

      showDetails();
      await Promise.resolve();

      expect(valuesContent().querySelector(".value-data").textContent).toBe(
        '{"theme":"dark"}',
      );
    });

    it("marks values without a backing attribute as unset and shows the default", async () => {
      mockValuesResponse({ success: true, values: sampleValues });

      showDetails();
      await Promise.resolve();

      const rows = valuesContent().querySelectorAll(".value-row");
      expect(rows[2].classList.contains("value-row-unset")).toBe(true);
      expect(rows[2].querySelector(".value-data").textContent).toBe("false");
    });

    it("shows a note when the controller declares no values", async () => {
      showDetails();
      await Promise.resolve();

      expect(valuesContent().textContent).toBe("No values declared.");
      expect(valuesContent().classList.contains("values-note")).toBe(true);
    });

    it("shows the error when fetching values fails", async () => {
      mockValuesResponse({ success: false, error: "Controller not found" });

      showDetails();
      await Promise.resolve();

      expect(valuesContent().textContent).toBe("Controller not found");
    });

    it("shows a fallback note when fetching fails without an error message", async () => {
      mockValuesResponse({ success: false });

      showDetails();
      await Promise.resolve();

      expect(valuesContent().textContent).toBe("Controller values failed");
    });

    it("shows a fallback note when the values request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerValues = () =>
        Promise.reject(new Error(""));

      showDetails();
      await Promise.resolve();

      expect(valuesContent().textContent).toBe("Controller values failed");
    });

    it("shows the relay error message when the values request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerValues = () =>
        Promise.reject(new Error("Could not establish connection"));

      showDetails();
      await Promise.resolve();

      expect(valuesContent().textContent).toBe(
        "Could not establish connection",
      );
    });

    it("replaces the note styling when values render after a previous note", async () => {
      showDetails();
      await Promise.resolve();
      expect(valuesContent().classList.contains("values-note")).toBe(true);

      mockValuesResponse({ success: true, values: sampleValues });
      showDetails({ nodeId: "frame-1", identifier: "modal" });
      await Promise.resolve();

      expect(valuesContent().classList.contains("values-note")).toBe(false);
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
    });

    it("ignores a stale response after another controller was shown", async () => {
      const pending = mockValuesDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      showDetails({ nodeId: "frame-2", identifier: "dropdown" });

      pending[1]({ success: true, values: sampleValues });
      await Promise.resolve();
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);

      pending[0]({ success: true, values: [] });
      await Promise.resolve();
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
    });

    it("ignores a stale response after the panel was closed", async () => {
      const pending = mockValuesDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      panel
        .querySelector(".details-panel-close")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      pending[0]({ success: true, values: sampleValues });
      await Promise.resolve();

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(0);
      expect(valuesContent().textContent).toBe("Loading…");
    });

    it("ignores a stale response after another identifier was shown for the same node", async () => {
      const pending = mockValuesDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      showDetails({ nodeId: "frame-1", identifier: "dropdown" });

      pending[1]({ success: true, values: [] });
      await Promise.resolve();

      pending[0]({ success: true, values: sampleValues });
      await Promise.resolve();

      expect(valuesContent().textContent).toBe("No values declared.");
    });

    it("refetches values when a scan refresh still finds the controller", async () => {
      mockValuesResponse({ success: true, values: sampleValues });

      showDetails();
      await Promise.resolve();

      scanRefreshed([
        { id: "frame-1", tagName: "div", controllers: ["modal", "dropdown"] },
      ]);
      await Promise.resolve();

      expect(calls).toEqual([
        ["controllerValues", "frame-1", "modal"],
        ["controllerValues", "frame-1", "modal"],
      ]);
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
    });
  });
});
