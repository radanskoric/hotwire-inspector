import { ID_PREFIX } from "../../constants.js";
import { formatControllerValue } from "../../controller-values.js";
import { showNotice } from "../notices.js";
import { PanelController } from "./panel-controller.js";

/**
 * @typedef {DetailsPanelController & {
 *   kindValue: string,
 *   nodeIdValue: string,
 *   identifierValue: string,
 *   identifierTarget: HTMLElement,
 *   valuesTarget: HTMLElement,
 *   targetsTarget: HTMLElement,
 *   outletsTarget: HTMLElement,
 *   eventContentTarget: HTMLElement,
 * }} DetailsPanelControllerWithTargets
 */

/**
 * Side panel for a Stimulus controller or a captured Turbo event attribute.
 * Panel-local document events open either view. Controller details reconcile
 * against fresh scans; event attributes remain until their source row is lost.
 */
export class DetailsPanelController extends PanelController {
  /** @override */
  static targets = [
    "identifier",
    "values",
    "targets",
    "outlets",
    "eventContent",
  ];

  /** @type {HTMLElement | null} */
  eventSource = null;

  /** @type {MutationObserver | null} */
  eventObserver = null;

  /** @override */
  static values = {
    kind: { type: String, default: "controller" },
    nodeId: String,
    identifier: String,
  };

  /** @override @this {DetailsPanelControllerWithTargets} */
  connect() {
    this.bridge.onValuesChanged((message) => this.handleValuesChanged(message));
  }

  /** @override @this {DetailsPanelControllerWithTargets} */
  disconnect() {
    this.clearEventSelection();
    this.unwatch();
  }

  /**
   * @param {CustomEvent<import("../../types.js").ShowControllerDetailsDetail>} event
   * @this {DetailsPanelControllerWithTargets}
   */
  show(event) {
    this.clearEventSelection();
    this.kindValue = "controller";
    const { nodeId, identifier } = event.detail;
    this.nodeIdValue = nodeId;
    this.identifierValue = identifier;
    this.identifierTarget.textContent = identifier;
    this.element.classList.add("open");
    this.loadSections();
  }

  /** @this {DetailsPanelControllerWithTargets} */
  close() {
    this.clearEventSelection();
    this.element.classList.remove("open");
    this.unwatch();
  }

  /**
   * @param {CustomEvent<import("../../types.js").ShowEventAttributeDetail>} event
   * @this {DetailsPanelControllerWithTargets}
   */
  showEventAttribute(event) {
    this.clearEventSelection();
    this.unwatch();
    this.nodeIdValue = "";
    this.identifierValue = "";
    const { source, name, attribute, value } = event.detail;
    this.kindValue = "event";
    this.identifierTarget.textContent = `${name} — ${attribute}`;
    this.eventContentTarget.textContent = value;
    this.eventSource = source;
    source.classList.add("selected");
    this.element.classList.add("open");
    // Observe row removal, including clear, eviction, and ancestor removal.
    this.eventObserver = new MutationObserver(() => {
      if (!source.isConnected) this.close();
    });
    this.eventObserver.observe(this.element.ownerDocument.body, {
      childList: true,
      subtree: true,
    });
  }

  /** @this {DetailsPanelControllerWithTargets} */
  clearEventSelection() {
    this.eventObserver?.disconnect();
    this.eventObserver = null;
    this.eventSource?.classList.remove("selected");
    this.eventSource = null;
    this.eventContentTarget.textContent = "";
  }

  /**
   * Keeps the panel in sync with fresh scan data: stays open (and re-renders)
   * while the element still exists and still has the controller, closes
   * otherwise.
   *
   * @param {CustomEvent<import("../../types.js").ScanRefreshedDetail>} event
   * @this {DetailsPanelControllerWithTargets}
   */
  refresh(event) {
    if (this.eventSource || !this.element.classList.contains("open")) {
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
   */
  watchValues() {
    if (this.eventSource || !this.element.classList.contains("open")) return;
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
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
   * @this {DetailsPanelControllerWithTargets}
   */
  showValuesNote(message) {
    this.valuesTarget.classList.add("values-note");
    this.valuesTarget.textContent = message;
  }

  /**
   * @returns {Promise<import("../../types.js").StoreControllerResponse>}
   * @this {DetailsPanelControllerWithTargets}
   */
  async storeInConsole() {
    const result = await this.storeControllerNode(
      this.nodeIdValue,
      this.identifierValue,
    );

    showNotice(
      this.element.ownerDocument,
      result.success
        ? `${result.identifier} controller instance stored as ${result.name}`
        : result.error || "Controller storage failed",
    );

    return result;
  }
}
