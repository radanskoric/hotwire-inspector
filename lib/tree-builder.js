export function buildTree(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const nodesById = new Map();
  const roots = [];

  for (const item of items) {
    nodesById.set(item.id, {
      ...item,
      children: [],
    });
  }

  for (const item of items) {
    const node = nodesById.get(item.id);

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
