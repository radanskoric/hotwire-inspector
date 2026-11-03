import { describe, expect, it } from "vitest";
import { filterControllerTree } from "../../lib/controller-tree-filter.js";

const item = (
  id,
  parentId,
  controllers = [],
  targets = [],
  tagName = "div",
) => ({ id, parentId, controllers, targets, tagName });

const hidden = new Set(["hidden"]);

describe("controller tree filtering", () => {
  it("removes hidden controllers, targets, and empty nodes", () => {
    const items = [
      item(
        "mixed",
        null,
        ["hidden", "menu"],
        [
          { controller: "hidden", name: "a" },
          { controller: "menu", name: "b" },
        ],
      ),
      item("hidden-controller", null, ["hidden"]),
      item("hidden-target", null, [], [{ controller: "hidden", name: "a" }]),
    ];
    expect(filterControllerTree(items, hidden)).toEqual([
      item("mixed", null, ["menu"], [{ controller: "menu", name: "b" }]),
    ]);
  });

  it("reconnects descendants to the nearest retained ancestor or root", () => {
    const items = [
      item("frame", null, [], [], "turbo-frame"),
      item("hidden", "frame", ["hidden"]),
      item("child", "hidden", ["menu"]),
      item("root", null, ["hidden"]),
      item("orphan", "root", ["menu"]),
      item("missing-parent", "missing", ["menu"]),
    ];
    expect(filterControllerTree(items, hidden)).toEqual([
      item("frame", null, [], [], "turbo-frame"),
      item("child", "frame", ["menu"]),
      item("orphan", null, ["menu"]),
      item("missing-parent", null, ["menu"]),
    ]);
  });

  it("retains frames even when their attachments are hidden or absent", () => {
    const items = [
      item("frame", null, ["hidden"], [], "turbo-frame"),
      { id: "bare-frame", parentId: null, tagName: "turbo-frame" },
    ];
    expect(filterControllerTree(items, hidden)).toEqual([
      item("frame", null, [], [], "turbo-frame"),
      item("bare-frame", null, [], [], "turbo-frame"),
    ]);
  });

  it("does not mutate scan records", () => {
    const items = [
      item("hidden", null, ["hidden"]),
      item(
        "child",
        "hidden",
        ["hidden", "menu"],
        [{ controller: "hidden", name: "a" }],
      ),
    ];
    const original = structuredClone(items);
    filterControllerTree(items, hidden);
    expect(items).toEqual(original);
  });

  it("returns the scan unchanged when nothing is excluded", () => {
    const items = [item("controller", null, ["menu"])];
    expect(filterControllerTree(items, new Set())).toEqual(items);
  });
});
