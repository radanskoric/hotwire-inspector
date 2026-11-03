// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControllerFilter } from "../../lib/panel/controller-filter.js";

let filter;
const combo = () => document.querySelector('[role="combobox"]');
const search = () =>
  document.querySelector('[aria-label="Search controllers"]');
const action = (name) =>
  document.querySelector(`[data-filter-action="${name}"]`);

function mount(
  identifiers = ["alpha", "menu", "zebra"],
  selected = identifiers,
) {
  document.body.innerHTML =
    '<select multiple aria-label="Filter controllers"></select><button id="next">Next</button>';
  const changes = [];
  filter = new ControllerFilter(document.querySelector("select"), (values) =>
    changes.push(values),
  );
  filter.update(identifiers, selected);
  return changes;
}

function openFilter() {
  combo().click();
  vi.runAllTimers();
}

function searchFor(value) {
  search().value = value;
  search().dispatchEvent(new Event("input", { bubbles: true }));
  vi.runAllTimers();
}

function key(element, name, options = {}) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  element.dispatchEvent(event);
  return event;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  filter?.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("controller combobox", () => {
  it("reports selection changes and applies bulk actions to all options while searching", () => {
    const changes = mount();
    expect(document.querySelector(".ts-count-display").textContent).toBe(
      "All controllers (3)",
    );
    openFilter();
    expect(
      [...document.querySelectorAll(".option")].map((el) => el.textContent),
    ).toEqual(["alpha", "menu", "zebra"]);
    expect(
      [...document.querySelectorAll(".tomselect-checkbox")].every(
        (checkbox) => checkbox.tabIndex === -1,
      ),
    ).toBe(true);
    document.querySelector('[data-value="menu"].option').click();
    expect(changes.at(-1)).toEqual(["alpha", "zebra"]);
    filter.update(["alpha", "menu", "zebra"], changes.at(-1));
    expect(document.querySelector(".ts-count-display").textContent).toBe(
      "2 of 3 controllers",
    );
    searchFor("menu");
    expect(document.querySelectorAll(".option")).toHaveLength(1);
    document
      .querySelector('[data-filter-action="clear"]')
      .dispatchEvent(new MouseEvent("mousedown", { cancelable: true }));
    action("clear").click();
    expect(changes.at(-1)).toEqual([]);
    expect(document.querySelector(".ts-count-display").textContent).toBe(
      "No controllers selected",
    );
    action("all").click();
    expect(changes.at(-1)).toEqual(["alpha", "menu", "zebra"]);
  });

  it("disables an empty filter and enables it when controllers appear", () => {
    mount([], []);
    expect(document.querySelector(".ts-count-display").textContent).toBe(
      "No controllers on page",
    );
    expect(combo().getAttribute("aria-disabled")).toBe("true");
    filter.update(["new"], ["new"]);
    expect(combo().getAttribute("aria-disabled")).toBe("false");
  });

  it("updates options silently while preserving an active search on live scans", () => {
    const changes = mount();
    openFilter();
    search().focus();
    searchFor("menu");

    filter.update(["alpha", "menu", "zebra"], ["menu"]);

    expect(changes).toEqual([]);
    expect(search().value).toBe("menu");
    expect(document.activeElement).toBe(search());
    expect(combo().getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".ts-count-display").textContent).toBe(
      "1 of 3 controllers",
    );
    filter.update(["menu", "new"], ["menu", "new"]);
    expect(changes).toEqual([]);
    expect(search().value).toBe("menu");
    expect(document.activeElement).toBe(search());
    expect(combo().getAttribute("aria-expanded")).toBe("true");
    searchFor("");
    expect(
      [...document.querySelectorAll(".option")].map((el) => el.textContent),
    ).toEqual(["menu", "new"]);
  });

  it("lets keyboard users reach global actions and close the popup with Escape", () => {
    mount(["menu"]);
    openFilter();
    search().focus();
    key(search(), "Tab", { keyCode: 9 });
    expect(document.activeElement).toBe(action("all"));
    expect(combo().getAttribute("aria-expanded")).toBe("true");
    action("clear").focus();
    expect(combo().getAttribute("aria-expanded")).toBe("true");
    key(action("clear"), "Escape");
    vi.runAllTimers();
    expect(combo().getAttribute("aria-expanded")).toBe("false");
  });

  it("allows backward tabbing from search and closes when focus leaves the actions", () => {
    mount(["menu"]);
    openFilter();
    search().focus();
    const backwardTab = key(search(), "Tab", { keyCode: 9, shiftKey: true });
    expect(backwardTab.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(action("all"));
    openFilter();
    search().focus();
    key(search(), "ArrowDown", { keyCode: 40 });
    key(search(), "Tab", { keyCode: 9 });
    key(action("all"), "ArrowRight");
    action("clear").focus();
    document.querySelector("#next").focus();
    expect(combo().getAttribute("aria-expanded")).toBe("false");
  });
});
