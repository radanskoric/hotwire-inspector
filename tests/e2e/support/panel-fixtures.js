import { ID_PREFIX } from "../../../lib/constants.js";

export const fixtureScanResponse = {
  items: [
    {
      id: "main-frame",
      src: "/main",
      parentId: null,
      tagName: "turbo-frame",
      controllers: ["sidebar"],
    },
    {
      id: "nested-frame",
      src: null,
      parentId: "main-frame",
      tagName: "turbo-frame",
      controllers: [],
    },
    {
      id: "modal-controller",
      parentId: "nested-frame",
      tagName: "div",
      controllers: ["modal", "dropdown"],
    },
    {
      id: "modal-close",
      parentId: "modal-controller",
      tagName: "button",
      controllers: [],
      targets: [
        { controller: "modal", name: "closeButton" },
        { controller: "modal", name: "trigger" },
        { controller: "dropdown", name: "item" },
      ],
    },
    {
      id: "sidebar-controller",
      parentId: null,
      tagName: "div",
      controllers: ["sidebar"],
    },
  ],
};

export const deepScanResponse = {
  items: [
    {
      id: "level-1",
      src: null,
      parentId: null,
      tagName: "turbo-frame",
      controllers: [],
    },
    {
      id: "level-2",
      src: null,
      parentId: "level-1",
      tagName: "turbo-frame",
      controllers: [],
    },
    {
      id: "level-3",
      parentId: "level-2",
      tagName: "div",
      controllers: ["modal"],
    },
    {
      id: "level-4",
      src: null,
      parentId: "level-3",
      tagName: "turbo-frame",
      controllers: [],
    },
    {
      id: "level-5",
      parentId: "level-4",
      tagName: "div",
      controllers: ["dropdown"],
    },
    {
      id: "level-6",
      src: null,
      parentId: "level-5",
      tagName: "turbo-frame",
      controllers: [],
    },
    {
      id: "level-7",
      parentId: "level-6",
      tagName: "div",
      controllers: ["sidebar"],
    },
  ],
};

export const internalIdScanResponse = {
  items: [
    {
      id: `${ID_PREFIX}-uuid-1`,
      parentId: null,
      tagName: "div",
      controllers: ["modal"],
    },
    {
      id: "user-controller",
      parentId: null,
      tagName: "div",
      controllers: ["menu"],
    },
  ],
};

export const emptyScanResponse = { items: [] };

// Default answer for controller-values messages in panel tests: two set
// values and one declared value without a backing attribute.
export const fixtureValuesResponse = {
  success: true,
  values: [
    {
      name: "title",
      type: "string",
      value: "Hello",
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
  ],
};

// Enough root nodes to make the tree taller than any test viewport, so the
// tree area becomes scrollable.
export const tallScanResponse = {
  items: Array.from({ length: 80 }, (_, index) => ({
    id: `frame-${index}`,
    parentId: null,
    tagName: "turbo-frame",
    controllers: index === 0 ? ["modal"] : [],
  })),
};

// Same tree as `fixtureScanResponse`, but the modal controller was removed
// from the element that declared it.
export const controllerRemovedScanResponse = {
  items: fixtureScanResponse.items.map((item) =>
    item.id === "modal-controller"
      ? { ...item, controllers: ["dropdown"] }
      : item,
  ),
};
