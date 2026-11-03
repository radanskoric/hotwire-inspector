import { ID_PREFIX } from "../../constants.js";
import { formatControllerValue } from "../../controller-values.js";
import { showNotice } from "../notices.js";
import { PanelController } from "./panel-controller.js";

/**
 * @typedef {StimulusControllerDetailsController & {
 *   nodeIdValue: string,
 *   identifierValue: string,
 *   valuesTarget: HTMLElement,
 *   targetsTarget: HTMLElement,
 *   outletsTarget: HTMLElement,
 * }} StimulusControllerDetailsControllerWithTargets
 */

/** Controller-specific rendering, live values, and scan reconciliation. */
export class StimulusControllerDetailsController extends PanelController {
  /** @override */
  static targets = ["values", "targets", "outlets"];
  /** @override */
  static values = { nodeId: String, identifier: String };

  active = false;
  // Distinguish refreshes and repeated selections of the same controller.
  revision = 0;

  /** @override @this {StimulusControllerDetailsControllerWithTargets} */
  connect() {
    this.bridge.onValuesChanged((message) => this.handleValuesChanged(message));
  }

  /** @override @this {StimulusControllerDetailsControllerWithTargets} */
  disconnect() {
    this.deactivate();
    this.bridge.offValuesChanged();
  }

  /**
   * @param {import("../../types.js").ShowControllerDetailsDetail} detail
   * @this {StimulusControllerDetailsControllerWithTargets}
   * @returns {string}
   */
  activate({ nodeId, identifier }) {
    this.active = true;
    this.nodeIdValue = nodeId;
    this.identifierValue = identifier;
    this.loadSections();
    return identifier;
  }

  /** @this {StimulusControllerDetailsControllerWithTargets} */
  deactivate() {
    this.revision++;
    if (!this.active) return;
    this.active = false;
    this.unwatchControllerValues().catch(() => {});
  }

  /**
   * Keeps the panel in sync with fresh scan data: stays open (and re-renders)
   * while the element still exists and still has the controller, closes
   * otherwise.
   *
   * @param {CustomEvent<import("../../types.js").ScanRefreshedDetail>} event
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  refresh(event) {
    if (!this.active) {
      return;
    }

    const { items } = event.detail;
    const item = items.find((candidate) => candidate.id === this.nodeIdValue);

    if (item?.controllers?.includes(this.identifierValue)) {
      this.loadSections();
    } else {
      this.dispatch("close-request", { prefix: "details-panel" });
    }
  }

  /**
   * Fetches the values, targets, and outlets sections in parallel on every
   * activation or refresh. Once the values request completes, start live
   * updates only if this is still the current selection and request.
   *
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  loadSections() {
    const revision = ++this.revision;
    this.loadValues(revision).then(() => {
      if (!this.active || this.revision !== revision) return;
      // Live updates are optional; a failed watch leaves the fetched values usable.
      this.watchControllerValues(this.nodeIdValue, this.identifierValue).catch(
        () => {},
      );
    });
    /**
     * @param {(entries: import("../../types.js").ControllerTargetEntry[]) => void} render
     * @param {"targets" | "outlets"} section
     * @param {HTMLElement} target
     */
    const renderSection =
      (render, section, target) =>
      /** @param {import("../../types.js").ControllerTargetsResponse | import("../../types.js").ControllerOutletsResponse} response */
      (response) => {
        if (!this.active || this.revision !== revision) return;
        if (response.success) {
          render("targets" in response ? response.targets : response.outlets);
        } else {
          this.showNote(
            target,
            response.error || `Controller ${section} failed`,
          );
        }
      };

    this.#loadTargets().then(
      renderSection(
        this.renderTargets.bind(this),
        "targets",
        this.targetsTarget,
      ),
    );
    this.#loadOutlets().then(
      renderSection(
        this.renderOutlets.bind(this),
        "outlets",
        this.outletsTarget,
      ),
    );
  }

  /**
   * @returns {Promise<import("../../types.js").ControllerTargetsResponse>}
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  async #loadTargets() {
    this.showNote(this.targetsTarget, "Loading…");
    try {
      return await this.controllerTargets(
        this.nodeIdValue,
        this.identifierValue,
      );
    } catch (error) {
      return { success: false, error: /** @type {Error} */ (error).message };
    }
  }

  /**
   * @returns {Promise<import("../../types.js").ControllerOutletsResponse>}
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  async #loadOutlets() {
    this.showNote(this.outletsTarget, "Loading…");
    try {
      return await this.controllerOutlets(
        this.nodeIdValue,
        this.identifierValue,
      );
    } catch (error) {
      return { success: false, error: /** @type {Error} */ (error).message };
    }
  }

  /**
   * @param {import("../../types.js").ControllerOutletEntry[]} outlets
   * @this {StimulusControllerDetailsControllerWithTargets}
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
   * @this {StimulusControllerDetailsControllerWithTargets}
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
   * @this {StimulusControllerDetailsController}
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
   * @param {number} revision
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  async loadValues(revision) {
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

    if (!this.active || this.revision !== revision) {
      return;
    }

    if (!response.success) {
      this.showValuesNote(response.error || "Controller values failed");
      return;
    }

    this.renderValues(response.values);
  }

  /**
   * Handles a values-changed push from the content script. Re-renders
   * the values only if the panel is open and showing the same controller.
   *
   * @param {import("../../types.js").ValuesChangedPush} message
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  handleValuesChanged(message) {
    if (
      !this.active ||
      message.id !== this.nodeIdValue ||
      message.identifier !== this.identifierValue
    ) {
      return;
    }

    this.renderValues(message.values);
  }

  /**
   * @param {import("../../types.js").ControllerValue[]} values
   * @this {StimulusControllerDetailsControllerWithTargets}
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
   * @this {StimulusControllerDetailsControllerWithTargets}
   */
  showValuesNote(message) {
    this.valuesTarget.classList.add("values-note");
    this.valuesTarget.textContent = message;
  }

  /**
   * @returns {Promise<import("../../types.js").StoreControllerResponse>}
   * @this {StimulusControllerDetailsControllerWithTargets}
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
