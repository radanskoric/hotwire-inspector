import { ID_PREFIX } from "../../constants.js";
import { formatControllerValue } from "../../controller-values.js";
import { PanelController } from "./panel-controller.js";

/**
 * Side panel showing the details of a single Stimulus controller instance.
 * Opened via a `SHOW_CONTROLLER_DETAILS_EVENT` custom event dispatched on
 * the panel window (see `PanelNodeController.showDetails`) and reconciled
 * against fresh scan data via `SCAN_REFRESHED_EVENT`.
 */
export class DetailsPanelController extends PanelController {
  static targets = ["identifier", "values", "targets", "outlets"];

  static values = {
    nodeId: String,
    identifier: String,
  };

  connect() {
    /** @type {this & { nodeIdValue: string, identifierValue: string, valuesTarget: HTMLElement }} */
    const self = /** @type {*} */ (this);
    this.bridge.onValuesChanged((message) => self.handleValuesChanged(message));
  }

  disconnect() {
    this.unwatch();
  }

  /**
   * @param {CustomEvent<import("../../types.js").ShowControllerDetailsDetail>} event
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, identifierTarget: HTMLElement, valuesTarget: HTMLElement, targetsTarget: HTMLElement, outletsTarget: HTMLElement }}
   */
  show(event) {
    const { nodeId, identifier } = event.detail;
    this.nodeIdValue = nodeId;
    this.identifierValue = identifier;
    this.identifierTarget.textContent = identifier;
    this.element.classList.add("open");
    this.loadSections();
  }

  close() {
    this.element.classList.remove("open");
    this.unwatch();
  }

  /**
   * Keeps the panel in sync with fresh scan data: stays open (and re-renders)
   * while the element still exists and still has the controller, closes
   * otherwise.
   *
   * @param {CustomEvent<import("../../types.js").ScanRefreshedDetail>} event
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, identifierTarget: HTMLElement, valuesTarget: HTMLElement, targetsTarget: HTMLElement, outletsTarget: HTMLElement }}
   */
  refresh(event) {
    if (!this.element.classList.contains("open")) {
      return;
    }

    const { items } = event.detail;
    const item = items.find((candidate) => candidate.id === this.nodeIdValue);

    if (item?.controllers?.includes(this.identifierValue)) {
      this.identifierTarget.textContent = this.identifierValue;
      this.loadSections();
    } else {
      this.close();
    }
  }

  /**
   * Fetches the values, targets, and outlets sections in parallel on every
   * `show`/`refresh`. Values are persisted via `watchValues`; the other two
   * sections are read-only and refetched on each refresh.
   *
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, valuesTarget: HTMLElement, targetsTarget: HTMLElement, outletsTarget: HTMLElement }}
   */
  loadSections() {
    this.loadValues().then(() => this.watchValues());
    this.loadTargets();
    this.loadOutlets();
  }

  /**
   * Fetches the shown controller's Stimulus targets and renders them into
   * the Targets section. Responses arriving after the panel moved on are
   * discarded (mirrors `loadValues`'s guard).
   *
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, targetsTarget: HTMLElement }}
   */
  async loadTargets() {
    const { nodeIdValue, identifierValue } = this;

    this.showNote(this.targetsTarget, "Loading…");

    /** @type {import("../../types.js").ControllerTargetsResponse} */
    let response;

    try {
      response = await this.controllerTargets(nodeIdValue, identifierValue);
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
      this.showNote(
        this.targetsTarget,
        response.error || "Controller targets failed",
      );
      return;
    }

    this.renderTargets(response.targets);
  }

  /**
   * Fetches the shown controller's Stimulus outlets and renders them into
   * the Outlets section. Clicking an outlet badge opens the panel for the
   * target controller via the same flow as a tree badge click.
   *
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, outletsTarget: HTMLElement }}
   */
  async loadOutlets() {
    const { nodeIdValue, identifierValue } = this;

    this.showNote(this.outletsTarget, "Loading…");

    /** @type {import("../../types.js").ControllerOutletsResponse} */
    let response;

    try {
      response = await this.controllerOutlets(nodeIdValue, identifierValue);
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
      this.showNote(
        this.outletsTarget,
        response.error || "Controller outlets failed",
      );
      return;
    }

    this.renderOutlets(response.outlets);
  }

  /**
   * @param {import("../../types.js").ControllerOutletEntry[]} outlets
   * @this {DetailsPanelController & { outletsTarget: HTMLElement }}
   */
  renderOutlets(outlets) {
    if (!outlets.length) {
      this.showNote(this.outletsTarget, "No outlets");
      return;
    }

    this.outletsTarget.classList.remove("details-note");
    this.outletsTarget.replaceChildren(
      ...this.renderElementRows(outlets, { badge: true }),
    );
  }

  /**
   * @param {import("../../types.js").ControllerTargetEntry[]} targets
   * @this {DetailsPanelController & { targetsTarget: HTMLElement }}
   */
  renderTargets(targets) {
    if (!targets.length) {
      this.showNote(this.targetsTarget, "No targets");
      return;
    }

    this.targetsTarget.classList.remove("details-note");
    this.targetsTarget.replaceChildren(
      ...this.renderElementRows(targets, { badge: false }),
    );
  }

  /**
   * Builds the rows used by both the targets and outlets sections. Clones
   * the shared template once per entry and configures the row for either a
   * plain name (targets) or a clickable badge (outlets).
   *
   * @param {{ id: string, tagName: string, name: string }[]} entries
   * @param {{ badge: boolean }} options
   * @this {DetailsPanelController}
   * @returns {HTMLElement[]}
   */
  renderElementRows(entries, { badge }) {
    const document = this.element.ownerDocument;
    const template = /** @type {HTMLTemplateElement | null} */ (
      document.getElementById("details-element-row-template")
    );

    return entries.map((entry) => {
      const row = /** @type {HTMLElement} */ (
        /** @type {DocumentFragment} */ (
          /** @type {HTMLTemplateElement} */ (template).content.cloneNode(true)
        ).firstElementChild
      );
      // The panel-node controller is attached to whichever inner element
      // declares `data-controller="panel-node"` (currently `.node-row`).
      // Its `idValue` is read from the same element's `data-panel-node-id-value`
      // attribute, so we must write the id there — not on the wrapper.
      const panelNodeElement = /** @type {HTMLElement} */ (
        row.querySelector('[data-controller="panel-node"]')
      );
      const kind = /** @type {HTMLElement} */ (row.querySelector(".node-kind"));
      const id = /** @type {HTMLElement} */ (row.querySelector(".node-id"));
      const name = /** @type {HTMLElement} */ (
        row.querySelector(".element-name")
      );

      panelNodeElement.dataset.panelNodeIdValue = entry.id;
      kind.textContent = entry.tagName;

      if (entry.id.startsWith(ID_PREFIX)) {
        id.hidden = true;
        id.textContent = "";
      } else {
        id.hidden = false;
        id.textContent = entry.id;
      }

      name.textContent = entry.name;

      if (badge) {
        name.classList.add("badge");
        name.dataset.controllerIdentifier = entry.name;
        name.dataset.action = "click->panel-node#showDetails";
      }

      return row;
    });
  }

  /**
   * Shows an italic muted note in the given section, replacing its contents.
   * Used for loading and empty/error states across sections.
   *
   * @param {HTMLElement} container
   * @param {string} message
   */
  showNote(container, message) {
    container.classList.add("details-note");
    container.textContent = message;
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
   * Starts watching the current controller's values for live updates.
   * Failures are silently tolerated (progressive enhancement).
   *
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string }}
   */
  watchValues() {
    const { nodeIdValue, identifierValue } = this;

    this.watchControllerValues(nodeIdValue, identifierValue).catch(() => {});
  }

  /**
   * Stops watching the current controller's values.
   *
   * @this {DetailsPanelController}
   */
  unwatch() {
    this.unwatchControllerValues().catch(() => {});
  }

  /**
   * Handles a values-changed push from the content script. Re-renders
   * the values only if the panel is open and showing the same controller.
   *
   * @param {import("../../types.js").ValuesChangedPush} message
   * @this {DetailsPanelController & { nodeIdValue: string, identifierValue: string, valuesTarget: HTMLElement }}
   */
  handleValuesChanged(message) {
    if (
      !this.element.classList.contains("open") ||
      message.id !== this.nodeIdValue ||
      message.identifier !== this.identifierValue
    ) {
      return;
    }

    this.renderValues(message.values);
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
