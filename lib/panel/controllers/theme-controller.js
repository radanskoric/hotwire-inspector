import { Controller } from "@hotwired/stimulus";

const THEME_STORAGE_KEY = "hotwire-inspector.theme";
/** @type {Set<unknown>} */
const THEME_VALUES = new Set(["system", "light", "dark"]);

/**
 * Controller for the theme `<select>` element in the panel toolbar.
 *
 * @extends {Controller<HTMLSelectElement>}
 */
export class ThemeController extends Controller {
  connect() {
    const storedTheme = this.storage?.getItem(THEME_STORAGE_KEY);
    const theme = this.validTheme(storedTheme);

    this.element.value = theme;
    this.applyTheme(theme);
  }

  setTheme() {
    const theme = this.validTheme(this.element.value);

    this.applyTheme(theme);
    this.storage?.setItem(THEME_STORAGE_KEY, theme);
  }

  /**
   * @param {string} theme
   */
  applyTheme(theme) {
    if (theme === "system") {
      this.rootElement.removeAttribute("data-theme");
      return;
    }

    this.rootElement.setAttribute("data-theme", theme);
  }

  /**
   * @param {string | null} theme
   * @returns {string}
   */
  validTheme(theme) {
    // A theme in THEME_VALUES is always one of the known strings.
    return THEME_VALUES.has(theme) ? /** @type {string} */ (theme) : "system";
  }

  get rootElement() {
    return this.element.ownerDocument.documentElement;
  }

  get storage() {
    return globalThis.localStorage;
  }
}
