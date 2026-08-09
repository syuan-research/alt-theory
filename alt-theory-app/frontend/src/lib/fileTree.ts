export interface FileTreeNode<T> {
  id: string;
  name: string;
  path: string;
  fullPath: string;
  children: string[];
  entry?: T;
}

export interface FileTreeModel<T> {
  rootId: string;
  nodes: Map<string, FileTreeNode<T>>;
  folderIds: string[];
}

function fullPath(basePath: string, relativePath: string): string {
  if (!basePath) return relativePath;
  const separator = basePath.includes("\\") ? "\\" : "/";
  const base = basePath.replace(/[\\/]+$/, "");
  return `${base}${separator}${relativePath.replace(/[\\/]/g, separator)}`;
}

export function buildFileTreeModel<T extends { path: string }>(
  entries: T[],
  basePath: string,
): FileTreeModel<T> {
  const rootId = "root";
  const nodes = new Map<string, FileTreeNode<T>>([
    [rootId, { id: rootId, name: "", path: "", fullPath: basePath, children: [] }],
  ]);

  for (const entry of entries) {
    const parts = entry.path.split(/[\\/]/).filter(Boolean);
    let parent = nodes.get(rootId)!;
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const id = `node:${path}`;
      let node = nodes.get(id);
      if (!node) {
        node = {
          id,
          name,
          path,
          fullPath: fullPath(basePath, path),
          children: [],
        };
        nodes.set(id, node);
        parent.children.push(id);
      }
      if (index === parts.length - 1) node.entry = entry;
      parent = node;
    });
  }

  for (const node of nodes.values()) {
    node.children.sort((leftId, rightId) => {
      const left = nodes.get(leftId)!;
      const right = nodes.get(rightId)!;
      const folderOrder = Number(right.children.length > 0) - Number(left.children.length > 0);
      return folderOrder || left.name.localeCompare(right.name);
    });
  }

  return {
    rootId,
    nodes,
    folderIds: [...nodes.values()]
      .filter((node) => node.id !== rootId && node.children.length > 0)
      .map((node) => node.id),
  };
}
