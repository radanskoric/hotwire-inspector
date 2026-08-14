/**
 * @param {import("./types.js").ScanItem[]} items
 * @returns {import("./types.js").TreeNode[]}
 */
export function buildTree(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const nodesById = /** @type {Map<string, import("./types.js").TreeNode>} */ (
    new Map()
  );
  const roots = [];

  for (const item of items) {
    nodesById.set(item.id, {
      ...item,
      children: [],
    });
  }

  for (const item of items) {
    // The first pass guarantees every item has a node.
    const node = /** @type {import("./types.js").TreeNode} */ (
      nodesById.get(item.id)
    );

    if (item.parentId == null) {
      roots.push(node);
      continue;
    }

    const parent = nodesById.get(item.parentId);

    if (parent) {
      parent.children.push(node);
      continue;
    }

    roots.push(node);
  }

  return roots;
}
