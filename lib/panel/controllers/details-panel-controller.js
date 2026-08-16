import { formatControllerValue } from "../../controller-values.js";
import { PanelController } from "./panel-controller.js";

/**
 * Side panel showing the details of a single Stimulus controller instance.
 * Opened via a `SHOW_CONTROLLER_DETAILS_EVENT` custom event dispatched on
 * the panel window (see `PanelNodeController.showDetails`) and reconciled
 * against fresh scan data via `SCAN_REFRESHED_EVENT`.
 */
export class DetailsPanelController extends PanelController {
  static targets = ["identifier", "values"];

  static values = {
    nodeId: String,
    identifier: String,
  };

  /**
   * @param {CustomEvent<import("../../types.js").ShowControllerDetailsDetail>} event
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, identifierTarget: HTMLElement, valuesTarget: HTMLElement }}
   */
  show(event) {
    const { nodeId, identifier } = event.detail;
    this.nodeIdValue = nodeId;
    this.identifierValue = identifier;
    this.identifierTarget.textContent = identifier;
    this.element.classList.add("open");
    this.loadValues();
  }

  close() {
    this.element.classList.remove("open");
  }

  /**
   * Keeps the panel in sync with fresh scan data: stays open (and re-renders)
   * while the element still exists and still has the controller, closes
   * otherwise.
   *
   * @param {CustomEvent<import("../../types.js").ScanRefreshedDetail>} event
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, identifierTarget: HTMLElement, valuesTarget: HTMLElement }}
   */
  refresh(event) {
    if (!this.element.classList.contains("open")) {
      return;
    }

    const { items } = event.detail;
    const item = items.find((candidate) => candidate.id === this.nodeIdValue);

    if (item?.controllers?.includes(this.identifierValue)) {
      this.identifierTarget.textContent = this.identifierValue;
      this.loadValues();
    } else {
      this.close();
    }
  }

  /**
   * Fetches the shown controller's Stimulus values and renders them into the
   * Values section. Responses arriving after the panel moved on (closed or
   * showing another controller) are discarded.
   *
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, valuesTarget: HTMLElement }}
   */
  async loadValues() {
    const { nodeIdValue, identifierValue } = this;

    this.showValuesNote("Loading…");

    /** @type {import("../../types.js").ControllerValuesResponse} */
    let response;

    try {
      response = await this.controllerValues(nodeIdValue, identifierValue);
    } catch (error) {
      response = {
        success: false,
        error: /** @type {Error} */ (error).message,
      };
    }

    if (
      !this.element.classList.contains("open") ||
      this.nodeIdValue !== nodeIdValue ||
      this.identifierValue !== identifierValue
    ) {
      return;
    }

    if (!response.success) {
      this.showValuesNote(response.error || "Controller values failed");
      return;
    }

    this.renderValues(response.values);
  }

  /**
   * @param {import("../../types.js").ControllerValue[]} values
   * @this {DetailsPanelController & { valuesTarget: HTMLElement }}
   */
  renderValues(values) {
    if (!values.length) {
      this.showValuesNote("No values declared.");
      return;
    }

    this.valuesTarget.classList.remove("values-note");

    const document = this.element.ownerDocument;
    const rows = values.map((value) => {
      const row = document.createElement("div");
      row.className = value.hasValue
        ? "value-row"
        : "value-row value-row-unset";

      const name = document.createElement("span");
      name.className = "value-name";
      name.textContent = value.name;

      const type = document.createElement("span");
      type.className = "value-type";
      type.textContent = value.type;

      const data = document.createElement("span");
      data.className = "value-data";
      // `value` is normally the raw attribute string, but format defensively:
      // a stale content/page script from a previous build (kept alive in an
      // open tab across an extension reload) may answer with typed values.
      data.textContent = formatControllerValue(
        value.hasValue ? value.value : value.defaultValue,
      );

      row.append(name, type, data);
      return row;
    });

    this.valuesTarget.replaceChildren(...rows);
  }

  /**
   * @param {string} message
   * @this {DetailsPanelController & { valuesTarget: HTMLElement }}
   */
  showValuesNote(message) {
    this.valuesTarget.classList.add("values-note");
    this.valuesTarget.textContent = message;
  }

  /**
   * @returns {Promise<import("../../types.js").StoreControllerResponse>}
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string }}
   */
  async storeInConsole() {
    const result = await this.storeControllerNode(
      this.nodeIdValue,
      this.identifierValue,
    );
    const template =
      this.element.ownerDocument.getElementById("notice-template");

    if (template) {
      // The notice template statically contains a root element with a
      // `[slot="text"]` child (see the panel HTML).
      const noticeElement = /** @type {Element} */ (
        /** @type {DocumentFragment} */ (
          /** @type {HTMLTemplateElement} */ (template).content.cloneNode(true)
        ).firstElementChild
      );
      const textTarget = /** @type {Element} */ (
        noticeElement.querySelector('[slot="text"]')
      );
      textTarget.textContent = result.success
        ? `${result.identifier} controller instance stored as ${result.name}`
        : result.error || "Controller storage failed";
      this.element.ownerDocument.body.appendChild(noticeElement);
    }

    return result;
  }
}
