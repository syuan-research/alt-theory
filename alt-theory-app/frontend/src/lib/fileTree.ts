export interface FileTreeNode<T> {
  id: string;
  name: string;
  path: string;
  fullPath: string;
  children: string[];
  isFolder: boolean;
  entry?: T;
}

export interface FileTreeModel<T> {
  rootId: string;
  nodes: Map<string, FileTreeNode<T>>;
  folderIds: string[];
}

export function getFileTreeNode<T>(model: FileTreeModel<T>, itemId: string) {
  return model.nodes.get(itemId) ?? null;
}

function fullPath(basePath: string, relativePath: string): string {
  if (!basePath) return relativePath;
  const separator = basePath.includes("\\") ? "\\" : "/";
  const base = basePath.replace(/[\\/]+$/, "");
  return `${base}${separator}${relativePath.replace(/[\\/]/g, separator)}`;
}

export function buildFileTreeModel<T extends { path: string; isDirectory?: boolean }>(
  entries: T[],
  basePath: string,
  preserveOrder = false,
): FileTreeModel<T> {
  const rootId = "root";
  const nodes = new Map<string, FileTreeNode<T>>([
    [rootId, { id: rootId, name: "", path: "", fullPath: basePath, children: [], isFolder: true }],
  ]);

  for (const entry of entries) {
    const parts = entry.path.split(/[\\/]/).filter(Boolean);
    const compact = preserveOrder && parts.length > 4;
    const labels = compact ? [...parts.slice(0, 3), parts.slice(3).join(" / ")] : parts;
    let parent = nodes.get(rootId)!;
    labels.forEach((name, index) => {
      const path = compact && index === 3
        ? parts.join("/")
        : parts.slice(0, index + 1).join("/");
      const id = `node:${path}`;
      let node = nodes.get(id);
      if (!node) {
        node = {
          id,
          name,
          path,
          fullPath: fullPath(basePath, path),
          children: [],
          isFolder: index < labels.length - 1 || entry.isDirectory === true,
        };
        nodes.set(id, node);
        parent.children.push(id);
      }
      if (index === labels.length - 1) {
        node.entry = entry;
        node.isFolder = entry.isDirectory === true || node.children.length > 0;
      } else {
        node.isFolder = true;
      }
      parent = node;
    });
  }

  for (const node of preserveOrder ? [] : nodes.values()) {
    node.children.sort((leftId, rightId) => {
      const left = nodes.get(leftId)!;
      const right = nodes.get(rightId)!;
      const folderOrder = Number(right.isFolder) - Number(left.isFolder);
      return folderOrder || left.name.localeCompare(right.name);
    });
  }

  return {
    rootId,
    nodes,
    folderIds: [...nodes.values()]
      .filter((node) => node.id !== rootId && node.isFolder)
      .map((node) => node.id),
  };
}
