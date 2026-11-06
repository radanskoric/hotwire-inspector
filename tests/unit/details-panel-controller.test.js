// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailsPanelController } from "../../lib/panel/controllers/details-panel-controller.js";
import { StimulusControllerDetailsController } from "../../lib/panel/controllers/stimulus-controller-details-controller.js";
import { LargePayloadDetailsController } from "../../lib/panel/controllers/large-payload-details-controller.js";
import { PanelNodeController } from "../../lib/panel/controllers/panel-node-controller.js";
import {
  ID_PREFIX,
  PANEL_BRIDGE_PROPERTY,
  SHOW_CONTROLLER_DETAILS_EVENT,
  SHOW_EVENT_ATTRIBUTE_EVENT,
  SCAN_REFRESHED_EVENT,
  VALUES_CHANGED_PUSH_TYPE,
} from "../../lib/constants.js";

// Flush promise callbacks and Stimulus mutations before asserting on the UI.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const markup = readFileSync("entrypoints/panel/index.html", "utf8");

describe("Details panel controller integration", () => {
  let application;
  let calls;
  let panel;
  let onValuesChangedCallback;

  beforeEach(async () => {
    calls = [];
    onValuesChangedCallback = null;
    const template = document.createElement("template");
    template.innerHTML = markup;
    document.body.replaceChildren(
      ...[
        "notice-template",
        "details-element-row-template",
        "details-panel",
      ].map((id) => template.content.querySelector(`#${id}`)),
    );
    document[PANEL_BRIDGE_PROPERTY] = {
      storeControllerNode(id, identifier) {
        calls.push(["storeControllerNode", id, identifier]);
        return Promise.resolve({ success: true, name: "temp1", identifier });
      },
      controllerValues() {
        return Promise.resolve({ success: true, values: [] });
      },
      controllerTargets() {
        return Promise.resolve({ success: true, targets: [] });
      },
      controllerOutlets() {
        return Promise.resolve({ success: true, outlets: [] });
      },
      watchControllerValues(id, identifier) {
        calls.push(["watchControllerValues", id, identifier]);
        return Promise.resolve({ success: true });
      },
      unwatchControllerValues() {
        calls.push(["unwatchControllerValues"]);
        return Promise.resolve({ success: true });
      },
      sendToInspectedTab(message) {
        calls.push(["sendToInspectedTab", message]);
        return Promise.resolve({ success: true });
      },
      inspectNode(id) {
        calls.push(["inspectNode", id]);
        return Promise.resolve();
      },
      offValuesChanged() {
        onValuesChangedCallback = null;
      },
      onValuesChanged(callback) {
        onValuesChangedCallback = callback;
      },
    };
    application = Application.start();
    application.register("details-panel", DetailsPanelController);
    application.register(
      "stimulus-controller-details",
      StimulusControllerDetailsController,
    );
    application.register(
      "large-payload-details",
      LargePayloadDetailsController,
    );
    application.register("panel-node", PanelNodeController);
    panel = document.getElementById("details-panel");

    await settle();
  });

  afterEach(async () => {
    document.body.replaceChildren();
    await settle();
    application.stop();
    delete document[PANEL_BRIDGE_PROPERTY];
  });

  it("shows the truncation notice after captured text and clears it for the next payload", async () => {
    const source = document.createElement("div");
    document.body.append(source);
    const show = (originalLength) =>
      document.dispatchEvent(
        new CustomEvent(SHOW_EVENT_ATTRIBUTE_EVENT, {
          detail: {
            source,
            name: "turbo:before-frame-render",
            attribute: "html",
            value: "x".repeat(65535),
            originalLength,
          },
        }),
      );
    show(70000);
    await settle();
    const content = panel.querySelector(".event-attribute-content");
    const notice = panel.querySelector(".event-attribute-notice");
    expect(content.textContent).toBe("x".repeat(65535));
    expect(
      content.compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(notice.textContent).toBe(
      "Showing 65,535 of 70,000 UTF-16 code units. The remaining HTML was omitted for performance.",
    );
    expect(notice.hidden).toBe(false);
    show(undefined);
    await settle();
    expect(notice.hidden).toBe(true);
    expect(notice.textContent).toBe("");
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

  function titleText() {
    return panel.querySelector("[data-details-panel-target='title']")
      .textContent;
  }

  function clickStoreButton() {
    panel
      .querySelector(".details-panel-store")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it.each([
    ["controllerValues", "values"],
    ["controllerTargets", "targets"],
    ["controllerOutlets", "outlets"],
  ])(
    "discards superseded %s responses for the same selection",
    async (method, section) => {
      const pending = [];
      document[PANEL_BRIDGE_PROPERTY][method] = () =>
        new Promise((resolve) => pending.push(resolve));

      showDetails();
      scanRefreshed([{ id: "frame-1", controllers: ["modal"] }]);
      pending[1]({ success: true, [section]: [] });
      await settle();
      const container = panel.querySelector(
        `[data-stimulus-controller-details-target='${section}']`,
      );
      const current = container.textContent;
      calls.length = 0;

      pending[0]({ success: false, error: "Obsolete failure" });
      await settle();

      expect(container.textContent).toBe(current);
      expect(
        calls.filter(([name]) => name === "watchControllerValues"),
      ).toEqual([]);
    },
  );

  it("opens the panel with the controller details when a show event is dispatched", async () => {
    showDetails();
    await settle();

    expect(panel.classList.contains("open")).toBe(true);
    expect(titleText()).toBe("modal");
  });

  it("closes the panel when the close button is clicked", async () => {
    showDetails();
    await settle();

    calls.length = 0;
    panel
      .querySelector(".details-panel-close")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();

    expect(panel.classList.contains("open")).toBe(false);
    expect(calls).toEqual([["unwatchControllerValues"]]);
  });

  it("closes the panel when Escape is pressed", async () => {
    showDetails();
    await settle();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("stores the shown controller instance when the store button is clicked", async () => {
    showDetails();
    await settle();

    clickStoreButton();
    await settle();

    expect(calls).toContainEqual(["storeControllerNode", "frame-1", "modal"]);

    const statusElement = document.querySelector(".status-notice");
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain(
      "modal controller instance stored as temp1",
    );
  });

  it("stores without rendering feedback when the notice template is unavailable", async () => {
    document.getElementById("notice-template").remove();
    showDetails();
    await settle();

    clickStoreButton();
    await settle();

    expect(document.querySelector(".status-notice")).toBeNull();
    expect(calls).toContainEqual(["storeControllerNode", "frame-1", "modal"]);
  });

  it("shows error feedback in status element on failed controller storage", async () => {
    document[PANEL_BRIDGE_PROPERTY].storeControllerNode = (id, identifier) => {
      calls.push(["storeControllerNode", id, identifier]);
      return Promise.resolve({ success: false, error: "Controller not found" });
    };
    showDetails();
    await settle();

    clickStoreButton();
    await settle();

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
    await settle();

    clickStoreButton();
    await settle();

    const statusElement = document.querySelector(".status-notice");
    expect(statusElement).not.toBeNull();
    expect(statusElement.textContent).toContain("Controller storage failed");
  });

  it("keeps the panel open when a scan refresh still finds the controller", async () => {
    showDetails();
    await settle();

    scanRefreshed([
      { id: "frame-1", tagName: "div", controllers: ["modal", "dropdown"] },
    ]);
    await settle();

    expect(panel.classList.contains("open")).toBe(true);
    expect(titleText()).toBe("modal");
  });

  it("closes the panel when a scan refresh no longer contains the element", async () => {
    showDetails();
    await settle();

    scanRefreshed([]);
    await settle();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("closes the panel when a scan refresh finds the element without the controller", async () => {
    showDetails();
    await settle();

    scanRefreshed([
      { id: "frame-1", tagName: "div", controllers: ["dropdown"] },
    ]);
    await settle();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("closes the panel when a scan refresh finds the element without controllers", async () => {
    showDetails();
    await settle();

    scanRefreshed([{ id: "frame-1", tagName: "div" }]);
    await settle();

    expect(panel.classList.contains("open")).toBe(false);
  });

  it("ignores scan refreshes while the panel is closed", async () => {
    scanRefreshed([{ id: "frame-1", tagName: "div", controllers: ["modal"] }]);
    await settle();

    expect(panel.classList.contains("open")).toBe(false);
    expect(titleText()).toBe("");
    expect(calls).toEqual([]);
  });

  it("application disconnect calls unwatchControllerValues", async () => {
    showDetails();
    await settle();

    calls.length = 0;
    panel.remove();
    await settle();

    expect(calls).toContainEqual(["unwatchControllerValues"]);
    expect(onValuesChangedCallback).toBeNull();
  });

  it("silently tolerates an unwatch failure during disconnect", async () => {
    document[PANEL_BRIDGE_PROPERTY].unwatchControllerValues = () =>
      Promise.reject(new Error("Disconnected"));

    showDetails();
    panel.remove();
    await settle();

    expect(panel.isConnected).toBe(false);
    expect(onValuesChangedCallback).toBeNull();
  });

  describe("values section", () => {
    function valuesContent() {
      return panel.querySelector(
        "[data-stimulus-controller-details-target='values']",
      );
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
      document[PANEL_BRIDGE_PROPERTY].controllerValues = () => {
        return Promise.resolve(response);
      };
    }

    function mockValuesDeferred() {
      const pending = [];
      document[PANEL_BRIDGE_PROPERTY].controllerValues = () => {
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
      await settle();

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
      await settle();

      expect(valuesContent().querySelector(".value-data").textContent).toBe(
        '{"theme":"dark"}',
      );
    });

    it("marks values without a backing attribute as unset and shows the default", async () => {
      mockValuesResponse({ success: true, values: sampleValues });

      showDetails();
      await settle();

      const rows = valuesContent().querySelectorAll(".value-row");
      expect(rows[2].classList.contains("value-row-unset")).toBe(true);
      expect(rows[2].querySelector(".value-data").textContent).toBe("false");
    });

    it("shows a note when the controller declares no values", async () => {
      showDetails();
      await settle();

      expect(valuesContent().textContent).toBe("No values declared.");
      expect(valuesContent().classList.contains("values-note")).toBe(true);
    });

    it("shows the error when fetching values fails", async () => {
      mockValuesResponse({ success: false, error: "Controller not found" });

      showDetails();
      await settle();

      expect(valuesContent().textContent).toBe("Controller not found");
    });

    it("shows a fallback note when fetching fails without an error message", async () => {
      mockValuesResponse({ success: false });

      showDetails();
      await settle();

      expect(valuesContent().textContent).toBe("Controller values failed");
    });

    it("shows a fallback note when the values request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerValues = () =>
        Promise.reject(new Error(""));

      showDetails();
      await settle();

      expect(valuesContent().textContent).toBe("Controller values failed");
    });

    it("shows the relay error message when the values request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerValues = () =>
        Promise.reject(new Error("Could not establish connection"));

      showDetails();
      await settle();

      expect(valuesContent().textContent).toBe(
        "Could not establish connection",
      );
    });

    it("replaces the note styling when values render after a previous note", async () => {
      showDetails();
      await settle();
      expect(valuesContent().classList.contains("values-note")).toBe(true);

      mockValuesResponse({ success: true, values: sampleValues });
      showDetails({ nodeId: "frame-1", identifier: "modal" });
      await settle();

      expect(valuesContent().classList.contains("values-note")).toBe(false);
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
    });

    it("ignores a stale response after another controller was shown", async () => {
      const pending = mockValuesDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      showDetails({ nodeId: "frame-2", identifier: "dropdown" });

      pending[1]({ success: true, values: sampleValues });
      await settle();
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);

      pending[0]({ success: true, values: [] });
      await settle();
      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
    });

    it("ignores a stale response after the panel was closed", async () => {
      const pending = mockValuesDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      panel
        .querySelector(".details-panel-close")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      pending[0]({ success: true, values: sampleValues });
      await settle();

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(0);
      expect(valuesContent().textContent).toBe("Loading…");
    });

    it("ignores a stale response after another identifier was shown for the same node", async () => {
      const pending = mockValuesDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      showDetails({ nodeId: "frame-1", identifier: "dropdown" });

      pending[1]({ success: true, values: [] });
      await settle();

      pending[0]({ success: true, values: sampleValues });
      await settle();

      expect(valuesContent().textContent).toBe("No values declared.");
    });

    it("updates displayed values after a scan refresh", async () => {
      showDetails();
      await settle();
      expect(valuesContent().textContent).toBe("No values declared.");

      mockValuesResponse({ success: true, values: sampleValues });
      scanRefreshed([{ id: "frame-1", controllers: ["modal"] }]);
      await settle();

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
      expect(valuesContent().querySelector(".value-data").textContent).toBe(
        "Greeting",
      );
    });

    it("starts live watching only after the initial values read completes", async () => {
      const pending = mockValuesDeferred();
      showDetails();
      await settle();
      expect(calls).not.toContainEqual([
        "watchControllerValues",
        "frame-1",
        "modal",
      ]);

      pending[0]({ success: true, values: [] });
      await settle();

      expect(calls).toContainEqual([
        "watchControllerValues",
        "frame-1",
        "modal",
      ]);
    });

    it("renders updated values when a values-changed push arrives with matching id/identifier", async () => {
      showDetails();
      await settle();

      onValuesChangedCallback({
        type: VALUES_CHANGED_PUSH_TYPE,
        id: "frame-1",
        identifier: "modal",
        values: sampleValues,
      });

      const rows = valuesContent().querySelectorAll(".value-row");
      expect(rows).toHaveLength(4);
      expect(rows[0].querySelector(".value-name").textContent).toBe("title");
    });

    it("ignores values-changed push when id does not match", async () => {
      showDetails();
      await settle();

      onValuesChangedCallback({
        type: VALUES_CHANGED_PUSH_TYPE,
        id: "frame-2",
        identifier: "modal",
        values: sampleValues,
      });

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(0);
      expect(valuesContent().textContent).toBe("No values declared.");
    });

    it("ignores values-changed push when identifier does not match", async () => {
      showDetails();
      await settle();

      onValuesChangedCallback({
        type: VALUES_CHANGED_PUSH_TYPE,
        id: "frame-1",
        identifier: "dropdown",
        values: sampleValues,
      });

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(0);
      expect(valuesContent().textContent).toBe("No values declared.");
    });

    it("ignores values-changed push when panel is closed", async () => {
      showDetails();
      await settle();

      panel
        .querySelector(".details-panel-close")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await settle();

      onValuesChangedCallback({
        type: VALUES_CHANGED_PUSH_TYPE,
        id: "frame-1",
        identifier: "modal",
        values: sampleValues,
      });

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(0);
    });

    it("refresh while still present re-issues watchControllerValues", async () => {
      mockValuesResponse({ success: true, values: sampleValues });

      showDetails();
      await settle();

      calls.length = 0;

      scanRefreshed([
        { id: "frame-1", tagName: "div", controllers: ["modal", "dropdown"] },
      ]);
      await settle();

      expect(calls).toEqual([["watchControllerValues", "frame-1", "modal"]]);
    });

    it("watchControllerValues rejection is tolerated", async () => {
      mockValuesResponse({ success: true, values: sampleValues });
      document[PANEL_BRIDGE_PROPERTY].watchControllerValues = (
        id,
        identifier,
      ) => {
        calls.push(["watchControllerValues", id, identifier]);
        return Promise.reject(new Error("watch failed"));
      };

      showDetails();
      await settle();

      expect(valuesContent().querySelectorAll(".value-row")).toHaveLength(4);
      expect(calls).toContainEqual([
        "watchControllerValues",
        "frame-1",
        "modal",
      ]);
    });
  });

  describe("targets section", () => {
    function targetsContent() {
      return panel.querySelector(
        "[data-stimulus-controller-details-target='targets']",
      );
    }

    function mockTargetsResponse(response) {
      document[PANEL_BRIDGE_PROPERTY].controllerTargets = () => {
        return Promise.resolve(response);
      };
    }

    function mockTargetsDeferred() {
      const pending = [];
      document[PANEL_BRIDGE_PROPERTY].controllerTargets = () => {
        return new Promise((resolve) => pending.push(resolve));
      };
      return pending;
    }

    it("shows a loading note while targets are being fetched", () => {
      mockTargetsDeferred();

      showDetails();

      expect(targetsContent().textContent).toBe("Loading…");
      expect(targetsContent().classList.contains("details-note")).toBe(true);
    });

    it("renders one row per target with kind, id, and name", async () => {
      mockTargetsResponse({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
          { id: "modal-trigger", tagName: "button", name: "trigger" },
        ],
      });

      showDetails();
      await settle();

      const rows = targetsContent().querySelectorAll(".node");
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector(".node-kind").textContent).toBe("button");
      expect(rows[0].querySelector(".node-id").textContent).toBe("modal-close");
      expect(rows[0].querySelector(".element-name").textContent).toBe(
        "closeButton",
      );
      // Plain target name — no badge style or show-details action.
      expect(
        rows[0].querySelector(".element-name").classList.contains("badge"),
      ).toBe(false);
    });

    it("hides internal generated ids in target rows", async () => {
      mockTargetsResponse({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
          {
            id: `${ID_PREFIX}-uuid-1`,
            tagName: "input",
            name: "input",
          },
        ],
      });

      showDetails();
      await settle();

      const rows = targetsContent().querySelectorAll(".node");
      expect(rows).toHaveLength(2);
      expect(rows[1].querySelector(".node-id").hidden).toBe(true);
    });

    it("shows a note when the controller declares no targets", async () => {
      mockTargetsResponse({ success: true, targets: [] });

      showDetails();
      await settle();

      expect(targetsContent().textContent).toBe("No targets");
      expect(targetsContent().classList.contains("details-note")).toBe(true);
      expect(targetsContent().querySelectorAll(".node")).toHaveLength(0);
    });

    it("shows the error when fetching targets fails", async () => {
      mockTargetsResponse({
        success: false,
        error: "Controller not found",
      });

      showDetails();
      await settle();

      expect(targetsContent().textContent).toBe("Controller not found");
    });

    it("shows a fallback note when fetching targets fails without an error", async () => {
      mockTargetsResponse({ success: false });

      showDetails();
      await settle();

      expect(targetsContent().textContent).toBe("Controller targets failed");
    });

    it("shows a fallback note when the targets request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerTargets = () =>
        Promise.reject(new Error(""));

      showDetails();
      await settle();

      expect(targetsContent().textContent).toBe("Controller targets failed");
    });

    it("shows the relay error when the targets request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerTargets = () =>
        Promise.reject(new Error("Could not establish connection"));

      showDetails();
      await settle();

      expect(targetsContent().textContent).toBe(
        "Could not establish connection",
      );
    });

    it("ignores a stale targets response after the controller changes", async () => {
      const pending = mockTargetsDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      showDetails({ nodeId: "frame-2", identifier: "dropdown" });

      pending[1]({
        success: true,
        targets: [{ id: "dropdown-item", tagName: "li", name: "item" }],
      });
      await settle();
      expect(targetsContent().querySelectorAll(".node")).toHaveLength(1);

      pending[0]({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
        ],
      });
      await settle();
      expect(targetsContent().querySelectorAll(".node")).toHaveLength(1);
      expect(targetsContent().querySelector(".element-name").textContent).toBe(
        "item",
      );
    });

    it("ignores a stale targets response after the panel was closed", async () => {
      const pending = mockTargetsDeferred();

      showDetails();
      panel
        .querySelector(".details-panel-close")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      pending[0]({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
        ],
      });
      await settle();

      expect(targetsContent().querySelectorAll(".node")).toHaveLength(0);
      expect(targetsContent().textContent).toBe("Loading…");
    });

    it("replaces note styling when targets render after a previous note", async () => {
      mockTargetsResponse({ success: true, targets: [] });

      showDetails();
      await settle();
      expect(targetsContent().classList.contains("details-note")).toBe(true);

      mockTargetsResponse({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
        ],
      });
      showDetails();
      await settle();

      expect(targetsContent().classList.contains("details-note")).toBe(false);
      expect(targetsContent().querySelectorAll(".node")).toHaveLength(1);
    });

    it("updates displayed targets after a scan refresh", async () => {
      showDetails();
      await settle();
      expect(targetsContent().textContent).toBe("No targets");

      mockTargetsResponse({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
        ],
      });
      scanRefreshed([{ id: "frame-1", controllers: ["modal"] }]);
      await settle();

      expect(targetsContent().querySelector(".element-name").textContent).toBe(
        "closeButton",
      );
    });

    it("reveal icon sends an inspect message for the row's element key", async () => {
      mockTargetsResponse({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
          {
            id: `${ID_PREFIX}-uuid-1`,
            tagName: "input",
            name: "input",
          },
        ],
      });

      showDetails();
      await settle();

      const inspectCallsBefore = calls.filter(
        ([name]) => name === "inspectNode",
      ).length;

      const rows = targetsContent().querySelectorAll(".node");
      expect(rows).toHaveLength(2);

      for (const row of rows) {
        const icon = row.querySelector("img.icon-btn");
        icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();
      }

      const inspectCalls = calls
        .filter(([name]) => name === "inspectNode")
        .slice(inspectCallsBefore);

      expect(inspectCalls).toEqual([
        ["inspectNode", "modal-close"],
        ["inspectNode", `${ID_PREFIX}-uuid-1`],
      ]);
    });

    it("hovering a target row sends highlight and leave sends clearHighlight for that element, just like in tree view", async () => {
      mockTargetsResponse({
        success: true,
        targets: [
          { id: "modal-close", tagName: "button", name: "closeButton" },
        ],
      });

      showDetails();
      await settle();

      const row = targetsContent().querySelector(".node .node-row");
      row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      row.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
      await settle();

      const highlightMessages = calls.filter(
        ([name, message]) =>
          name === "sendToInspectedTab" &&
          (message?.type === "hotwire-inspector:highlight" ||
            message?.type === "hotwire-inspector:clear-highlight"),
      );

      expect(highlightMessages).toEqual([
        [
          "sendToInspectedTab",
          { type: "hotwire-inspector:highlight", id: "modal-close" },
        ],
        ["sendToInspectedTab", { type: "hotwire-inspector:clear-highlight" }],
      ]);
    });
  });

  describe("outlets section", () => {
    function outletsContent() {
      return panel.querySelector(
        "[data-stimulus-controller-details-target='outlets']",
      );
    }

    function mockOutletsResponse(response) {
      document[PANEL_BRIDGE_PROPERTY].controllerOutlets = () => {
        return Promise.resolve(response);
      };
    }

    function mockOutletsDeferred() {
      const pending = [];
      document[PANEL_BRIDGE_PROPERTY].controllerOutlets = () => {
        return new Promise((resolve) => pending.push(resolve));
      };
      return pending;
    }

    it("shows a loading note while outlets are being fetched", () => {
      mockOutletsDeferred();

      showDetails();

      expect(outletsContent().textContent).toBe("Loading…");
      expect(outletsContent().classList.contains("details-note")).toBe(true);
    });

    it("renders one row per outlet with the outlet name as a clickable badge", async () => {
      mockOutletsResponse({
        success: true,
        outlets: [
          { id: "user-status-element", tagName: "div", name: "user-status" },
          { id: "menu-element", tagName: "nav", name: "menu" },
        ],
      });

      showDetails();
      await settle();

      const rows = outletsContent().querySelectorAll(".node");
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector(".node-kind").textContent).toBe("div");
      const name = rows[0].querySelector(".element-name");
      expect(name.textContent).toBe("user-status");
      expect(name.classList.contains("badge")).toBe(true);
    });

    it("dispatches SHOW_CONTROLLER_DETAILS_EVENT with the outlet element's nodeId and the outlet name when an outlet badge is clicked", async () => {
      mockOutletsResponse({
        success: true,
        outlets: [
          { id: "user-status-element", tagName: "div", name: "user-status" },
        ],
      });

      showDetails();
      await settle();

      const showListener = vi.fn();
      document.addEventListener(SHOW_CONTROLLER_DETAILS_EVENT, showListener, {
        once: true,
      });

      const outletName = outletsContent().querySelector(".element-name");
      outletName.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await settle();

      expect(showListener).toHaveBeenCalledTimes(1);
      const detail = showListener.mock.calls[0][0].detail;
      expect(detail).toEqual({
        nodeId: "user-status-element",
        identifier: "user-status",
      });
    });

    it("shows a note when the controller declares no outlets", async () => {
      mockOutletsResponse({ success: true, outlets: [] });

      showDetails();
      await settle();

      expect(outletsContent().textContent).toBe("No outlets");
      expect(outletsContent().classList.contains("details-note")).toBe(true);
      expect(outletsContent().querySelectorAll(".node")).toHaveLength(0);
    });

    it("shows the error when fetching outlets fails", async () => {
      mockOutletsResponse({
        success: false,
        error: "Controller not found",
      });

      showDetails();
      await settle();

      expect(outletsContent().textContent).toBe("Controller not found");
    });

    it("shows a fallback note when fetching outlets fails without an error", async () => {
      mockOutletsResponse({ success: false });

      showDetails();
      await settle();

      expect(outletsContent().textContent).toBe("Controller outlets failed");
    });

    it("shows a fallback note when the outlets request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerOutlets = () =>
        Promise.reject(new Error(""));

      showDetails();
      await settle();

      expect(outletsContent().textContent).toBe("Controller outlets failed");
    });

    it("shows the relay error when the outlets request rejects", async () => {
      document[PANEL_BRIDGE_PROPERTY].controllerOutlets = () =>
        Promise.reject(new Error("Could not establish connection"));

      showDetails();
      await settle();

      expect(outletsContent().textContent).toBe(
        "Could not establish connection",
      );
    });

    it("ignores a stale outlets response after the controller changes", async () => {
      const pending = mockOutletsDeferred();

      showDetails({ nodeId: "frame-1", identifier: "modal" });
      showDetails({ nodeId: "frame-2", identifier: "dropdown" });

      pending[1]({
        success: true,
        outlets: [{ id: "dropdown-outlet", tagName: "div", name: "menu" }],
      });
      await settle();
      expect(outletsContent().querySelectorAll(".node")).toHaveLength(1);

      pending[0]({
        success: true,
        outlets: [{ id: "modal-outlet", tagName: "div", name: "user-status" }],
      });
      await settle();
      expect(outletsContent().querySelectorAll(".node")).toHaveLength(1);
      expect(outletsContent().querySelector(".element-name").textContent).toBe(
        "menu",
      );
    });

    it("ignores a stale outlets response after the panel was closed", async () => {
      const pending = mockOutletsDeferred();

      showDetails();
      panel
        .querySelector(".details-panel-close")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      pending[0]({
        success: true,
        outlets: [{ id: "modal-outlet", tagName: "div", name: "user-status" }],
      });
      await settle();

      expect(outletsContent().querySelectorAll(".node")).toHaveLength(0);
      expect(outletsContent().textContent).toBe("Loading…");
    });

    it("updates displayed outlets after a scan refresh", async () => {
      showDetails();
      await settle();
      expect(outletsContent().textContent).toBe("No outlets");

      mockOutletsResponse({
        success: true,
        outlets: [{ id: "menu-element", tagName: "nav", name: "menu" }],
      });
      scanRefreshed([{ id: "frame-1", controllers: ["modal"] }]);
      await settle();

      expect(outletsContent().querySelector(".element-name").textContent).toBe(
        "menu",
      );
    });
  });
});
