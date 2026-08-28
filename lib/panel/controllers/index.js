import { PANEL_BRIDGE_PROPERTY } from "../../constants.js";
import { DetailsPanelController } from "./details-panel-controller.js";
import { NodeController } from "./node-controller.js";
import { PanelNodeController } from "./panel-node-controller.js";
import { StatusController } from "./status-controller.js";
import { ThemeController } from "./theme-controller.js";
import { TurboEventsController } from "./turbo-events-controller.js";

/**
 * @param {import("@hotwired/stimulus").Application} application
 * @param {import("../../panel-bridge.js").PanelBridge} panelBridge
 * @param {Document} [document]
 */
export function registerPanelControllers(
  application,
  panelBridge,
  document = globalThis.document,
) {
  /** @type {Document & Record<typeof PANEL_BRIDGE_PROPERTY, import("../../panel-bridge.js").PanelBridge>} */ (
    document
  )[PANEL_BRIDGE_PROPERTY] = panelBridge;
  application.register("details-panel", DetailsPanelController);
  application.register("node", NodeController);
  application.register("panel-node", PanelNodeController);
  application.register("status", StatusController);
  application.register("theme", ThemeController);
  application.register("turbo-events", TurboEventsController);
}
