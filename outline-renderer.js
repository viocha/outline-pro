/**
 * OutlineRenderer - Shared UI Logic for Side Panel and Floating Panel
 */
export class OutlineRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options; // { onRefresh, onJump, onHighlight, onSwitchMode, onMenuAction }
        this.currentHeadings = [];
    }

    render(headings) {
        this.currentHeadings = headings;
        this.container.innerHTML = '';

        if (!headings || headings.length === 0) {
            this.container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">未发现标题</p>';
            return;
        }

        // 虚拟根节点，level 0
        const rootDiv = document.createElement('div');
        const stack = [{ element: rootDiv, level: 0 }];

        headings.forEach((h, index) => {
            const level = h.level;

            // 1. 回溯栈
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            const parentEntry = stack[stack.length - 1];

            // 2. 创建当前节点结构
            const node = document.createElement('div');
            node.className = `toc-node level-${level} is-leaf`; // Default to leaf
            node.dataset.index = index;

            // Header
            const header = document.createElement('div');
            header.className = 'toc-header';

            // Icon
            const icon = document.createElement('div');
            icon.className = 'toggle-icon';
            icon.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4.646 6.354l3.328 3.329 3.328-3.329c.195-.195.512-.195.707 0s.195.512 0 .707l-3.683 3.682c-.195.195-.512.195-.707 0L4.293 7.06a.5.5 0 0 1 .453-.806z"/></svg>';

            // Text
            const text = document.createElement('div');
            text.className = 'toc-text';
            text.textContent = h.text;
            text.title = h.text;

            // Click events
            text.onclick = (e) => {
                e.stopPropagation();
                if (this.options.onJump) this.options.onJump(index);
            };
            text.ondblclick = (e) => {
                e.stopPropagation();
                if (this.options.onHighlight) this.options.onHighlight(index);
            };

            header.onclick = () => {
                if (node.classList.contains('is-leaf')) {
                    if (this.options.onJump) this.options.onJump(index);
                } else {
                    this.toggleNode(node);
                }
            };

            header.ondblclick = (e) => {
                e.stopPropagation();
                if (node.classList.contains('is-leaf')) {
                    if (this.options.onHighlight) this.options.onHighlight(index);
                }
            };

            header.appendChild(icon);
            header.appendChild(text);

            // Children Container
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'toc-children';

            node.appendChild(header);
            node.appendChild(childrenContainer);

            // 3. 挂载
            parentEntry.element.appendChild(node);

            // 4. Update parent's leaf status
            if (parentEntry.nodeRef) {
                parentEntry.nodeRef.classList.remove('is-leaf');
            }

            // 入栈
            stack.push({
                element: childrenContainer,
                level: level,
                nodeRef: node
            });
        });

        while (rootDiv.firstChild) {
            this.container.appendChild(rootDiv.firstChild);
        }

        // Auto Smart Collapse (Threshold 50)
        this.smartCollapse(50);
    }

    toggleNode(node) {
        if (node.classList.contains('is-collapsed')) {
            node.classList.remove('is-collapsed');
        } else {
            node.classList.add('is-collapsed');
        }
    }

    collapseAll() {
        const nodes = this.container.querySelectorAll('.toc-node');
        nodes.forEach(node => {
            if (!node.classList.contains('is-leaf')) {
                node.classList.add('is-collapsed');
            }
        });
    }

    expandAll() {
        const nodes = this.container.querySelectorAll('.toc-node');
        nodes.forEach(node => {
            node.classList.remove('is-collapsed');
        });
    }

    expandToLevel(targetLevel) {
        const nodes = this.container.querySelectorAll('.toc-node');
        nodes.forEach(node => {
            const match = node.className.match(/level-(\d+)/);
            if (match) {
                const level = parseInt(match[1]);
                if (level < targetLevel) {
                    node.classList.remove('is-collapsed');
                } else {
                    if (!node.classList.contains('is-leaf')) {
                        node.classList.add('is-collapsed');
                    }
                }
            }
        });
    }

    /**
     * Smart Collapse Function
     * Collapses nodes with more children than threshold.
     * Exception: If there is only ONE Level-1 node, it is never collapsed.
     * @param {number} threshold - The count of children to trigger collapse
     */
    smartCollapse(threshold) {
        // 1. Check for single Level-1 exception
        const level1Nodes = Array.from(this.container.querySelectorAll('.toc-node.level-1'));
        const isSingleLevel1 = level1Nodes.length === 1;
        const singleLevel1Ref = isSingleLevel1 ? level1Nodes[0] : null;

        // 2. Iterate all parent nodes
        const parentNodes = this.container.querySelectorAll('.toc-node:not(.is-leaf)');
        parentNodes.forEach(node => {
            // Exception Logic: If it is the single dominant level-1 node, force expand
            if (node === singleLevel1Ref) {
                node.classList.remove('is-collapsed');
                return;
            }

            const childrenContainer = node.querySelector('.toc-children');
            if (childrenContainer) {
                // Count direct children nodes
                const childCount = childrenContainer.querySelectorAll(':scope > .toc-node').length;

                if (childCount > threshold) {
                    node.classList.add('is-collapsed');
                } else {
                    node.classList.remove('is-collapsed');
                }
            }
        });
    }

    // Generate Dropdown Menu Content
    createDropdownContent(headings) {
        const fragment = document.createDocumentFragment();

        const header = document.createElement('div');
        header.className = 'dropdown-header';
        header.textContent = 'Show Levels';
        fragment.appendChild(header);

        let maxLevel = 0;
        if (headings && headings.length > 0) {
            headings.forEach(h => {
                // Assuming headings are already normalized
                if (h.level > maxLevel) maxLevel = h.level;
            });
        }

        const limit = Math.max(maxLevel, 1);
        for (let i = 1; i <= limit; i++) {
            if (i > 6) break;
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = `Level ${i}`;
            item.onclick = (e) => {
                e.stopPropagation();
                this.expandToLevel(i);
                if (this.options.onMenuAction) this.options.onMenuAction();
            };
            fragment.appendChild(item);
        }

        // --- Smart Collapse Section ---
        // 1. Calculate Max Direct Children Count across the entire tree
        let maxChildren = 0;
        const childrenContainers = this.container.querySelectorAll('.toc-children');
        childrenContainers.forEach(container => {
            const count = container.querySelectorAll(':scope > .toc-node').length;
            if (count > maxChildren) maxChildren = count;
        });

        // 2. Filter useful thresholds
        // A threshold T is useful if there is at least one node with children > T
        const allThresholds = [10, 20, 30, 40, 50];
        const validThresholds = allThresholds.filter(t => maxChildren > t);

        if (validThresholds.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'dropdown-divider';
            fragment.appendChild(divider);

            const scHeader = document.createElement('div');
            scHeader.className = 'dropdown-header';
            scHeader.textContent = 'Smart Collapse';
            fragment.appendChild(scHeader);

            validThresholds.forEach(t => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = `> ${t} Items`;
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.smartCollapse(t);
                    if (this.options.onMenuAction) this.options.onMenuAction();
                };
                fragment.appendChild(item);
            });
        }

        return fragment;
    }
}
