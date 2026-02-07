export interface HeadingItem {
  tag: string;
  text: string;
  id: string;
  level: number;
}

export interface TreeNode {
  heading: HeadingItem;
  index: number;
  children: TreeNode[];
}

/** Build a tree structure from flat headings using a stack algorithm */
export function buildTree(headings: HeadingItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: { nodes: TreeNode[]; level: number }[] = [
    { nodes: root, level: 0 },
  ];

  headings.forEach((h, index) => {
    const level = h.level;
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const node: TreeNode = { heading: h, index, children: [] };
    stack[stack.length - 1].nodes.push(node);
    stack.push({ nodes: node.children, level });
  });

  return root;
}

/** Normalize headings so the minimum level becomes 1 */
export function normalizeHeadings(
  rawHeadings: { tag: string; text: string; id: string }[],
): HeadingItem[] {
  if (rawHeadings.length === 0) return [];
  let minLevel = 6;
  rawHeadings.forEach((h) => {
    const l = parseInt(h.tag.substring(1));
    if (l < minLevel) minLevel = l;
  });
  return rawHeadings.map((h) => ({
    ...h,
    level: parseInt(h.tag.substring(1)) - minLevel + 1,
  }));
}

export type FloatingState = {
  isVisible: boolean;
  top: string;
  right: string;
  width: string;
  height: string;
};
