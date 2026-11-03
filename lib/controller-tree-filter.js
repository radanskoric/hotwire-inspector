/**
 * Project scan data into the visible tree without changing page identity or
 * scan records. Hidden ancestors are skipped rather than losing their hierarchy.
 * @param {import("./types.js").ScanItem[]} items
 * @param {Set<string>} excluded
 * @returns {import("./types.js").ScanItem[]}
 */
export function filterControllerTree(items, excluded) {
  if (!excluded.size) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const visible = items
    .map((item) => ({
      ...item,
      controllers: (item.controllers ?? []).filter(
        (name) => !excluded.has(name),
      ),
      targets: (item.targets ?? []).filter(
        (target) => !excluded.has(target.controller),
      ),
    }))
    .filter(
      (item) =>
        item.tagName === "turbo-frame" ||
        item.controllers.length ||
        item.targets.length,
    );
  const visibleIds = new Set(visible.map((item) => item.id));
  for (const item of visible) {
    let parentId = item.parentId;
    while (parentId != null && !visibleIds.has(parentId)) {
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    item.parentId = parentId;
  }
  return visible;
}
