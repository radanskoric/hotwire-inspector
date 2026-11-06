import TomSelect from "tom-select/base";
import checkboxOptions from "tom-select/plugins/checkbox_options/plugin.js";
import dropdownInput from "tom-select/plugins/dropdown_input/plugin.js";
import noActiveItems from "tom-select/plugins/no_active_items/plugin.js";
import noBackspaceDelete from "tom-select/plugins/no_backspace_delete/plugin.js";

TomSelect.define("checkbox_options", checkboxOptions);
TomSelect.define("dropdown_input", dropdownInput);
TomSelect.define("no_active_items", noActiveItems);
TomSelect.define("no_backspace_delete", noBackspaceDelete);

/** Trimmed Rails Blocks combobox: local multiselect, dropdown search and count. */
export class Filter {
  /**
   * @param {HTMLSelectElement} element
   * @param {(selected: string[]) => void} onChange
   * @param {string} [noun] Plural option label.
   */
  constructor(element, onChange, noun = "controllers") {
    this.noun = noun;
    this.onChange = onChange;
    /** @type {string[]} */
    this.identifiers = [];
    this.select = new TomSelect(element, {
      plugins: [
        "checkbox_options",
        "dropdown_input",
        "no_active_items",
        "no_backspace_delete",
      ],
      maxItems: null,
      maxOptions: null,
      closeAfterSelect: false,
      create: false,
      hideSelected: false,
      sortField: [
        { field: "text", direction: "asc" },
        { field: "$score", direction: "desc" },
      ],
      onChange: () => {
        this.updateCount();
        this.onChange([...this.select.items]);
      },
    });
    this.count = document.createElement("span");
    this.count.className = "ts-count-display";
    this.select.control.appendChild(this.count);
    this.#configureAccessibility();
    const actions = this.#addBulkActions();
    this.#configureActionKeyboard(actions);
  }

  #configureAccessibility() {
    this.select.control_input.type = "search";
    this.select.control_input.placeholder = `Search ${this.noun}…`;
    this.select.control_input.setAttribute("aria-label", `Search ${this.noun}`);
    this.select.focus_node.setAttribute("aria-label", `Filter ${this.noun}`);
    this.select.dropdown_content.setAttribute("aria-multiselectable", "true");
    // Arrow keys navigate the options; their decorative checkboxes must not
    // introduce a second tab stop for every controller on the page.
    this.select.hook("after", "refreshOptions", () => {
      for (const checkbox of this.select.dropdown_content.querySelectorAll(
        "input",
      )) {
        checkbox.tabIndex = -1;
        checkbox.setAttribute("aria-hidden", "true");
      }
    });
  }

  #addBulkActions() {
    const actions = document.createElement("div");
    actions.className = "filter-actions";
    for (const [action, label] of /** @type {[string, string][]} */ ([
      ["all", "Select all"],
      ["clear", "Clear all"],
    ])) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-small";
      button.dataset.filterAction = action;
      button.textContent = label;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        this.select.setValue(action === "all" ? this.identifiers : []);
      });
      actions.appendChild(button);
    }
    this.select.dropdown.insertBefore(actions, this.select.dropdown_content);
    return actions;
  }

  /** @param {HTMLElement} actions */
  #configureActionKeyboard(actions) {
    // Tom Select's dropdown input normally tabs out and closes. Let keyboard
    // users visit the two global actions before leaving the popup.
    this.select.control_input.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
          /** @type {HTMLButtonElement} */ (actions.firstElementChild).focus();
        }
      },
      true,
    );
    this.select.control_input.addEventListener(
      "blur",
      (event) => {
        if (
          actions.contains(/** @type {Node | null} */ (event.relatedTarget))
        ) {
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    actions.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.select.close();
    });
    actions.addEventListener("focusout", (event) => {
      if (
        !this.select.dropdown.contains(
          /** @type {Node | null} */ (event.relatedTarget),
        )
      ) {
        this.select.onBlur();
      }
    });
  }

  /** @param {string[]} identifiers @param {string[]} selected */
  update(identifiers, selected) {
    // Leave search, focus and scroll untouched on ordinary live scans.
    if (this.identifiers.join("\n") !== identifiers.join("\n")) {
      this.identifiers = identifiers;
      this.select.clear(true);
      this.select.clearOptions();
      this.select.addOptions(
        identifiers.map((value) => ({ value, text: value })),
      );
    }
    if (JSON.stringify(this.select.items) !== JSON.stringify(selected)) {
      this.select.setValue(selected, true);
    }
    if (identifiers.length) this.select.enable();
    else this.select.disable();
    this.select.focus_node.setAttribute(
      "aria-disabled",
      String(!identifiers.length),
    );
    this.select.refreshOptions(false);
    this.updateCount();
  }

  updateCount() {
    const total = this.identifiers.length;
    const selected = this.select.items.length;
    this.count.textContent = !total
      ? this.noun === "controllers"
        ? "No controllers on page"
        : `No ${this.noun} available`
      : !selected
        ? `No ${this.noun} selected`
        : selected === total
          ? `All ${this.noun} (${total})`
          : `${selected} of ${total} ${this.noun}`;
  }

  destroy() {
    this.select.destroy();
  }
}
