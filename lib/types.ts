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

export interface Settings {
  /** 是否自动高亮目录中当前浏览的标题 */
  autoHighlightActive: boolean;
  /** 高亮背景色透明度 (%) */
  highlightOpacity: 10 | 20 | 30 | 40 | 50;
  /** 非叶子节点点击空白处时是否跳转到标题 */
  nonLeafBlankAreaJump: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoHighlightActive: false,
  highlightOpacity: 30,
  nonLeafBlankAreaJump: false,
};

export const SETTINGS_KEY = 'outline_pro_settings';

export async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] ?? {}) });
    });
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, resolve);
  });
}

/** Compute a stable fingerprint for a set of headings */
export function headingsFingerprint(headings: HeadingItem[]): string {
  return headings.map((h) => `${h.level}:${h.text}`).join('|');
}

export interface CollapseState {
  fingerprint: string;
  collapsed: number[];
}

const COLLAPSE_STATE_KEY = 'outline_collapse_state';

export async function loadCollapseState(): Promise<CollapseState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(COLLAPSE_STATE_KEY, (data) => {
      resolve((data[COLLAPSE_STATE_KEY] as CollapseState) ?? null);
    });
  });
}

export async function saveCollapseState(state: CollapseState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [COLLAPSE_STATE_KEY]: state }, resolve);
  });
}

export interface ScrollState {
  fingerprint: string;
  scrollTop: number;
}

const SCROLL_STATE_KEY = 'outline_scroll_state';

export async function loadScrollState(): Promise<ScrollState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SCROLL_STATE_KEY, (data) => {
      resolve((data[SCROLL_STATE_KEY] as ScrollState) ?? null);
    });
  });
}

export async function saveScrollState(state: ScrollState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SCROLL_STATE_KEY]: state }, resolve);
  });
}
