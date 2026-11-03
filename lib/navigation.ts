import type { Settings } from './types';

export function getScrollPositionRatio(position: Settings['scrollPosition']): number {
  return { top: 0, fifth: 0.2, quarter: 0.25, center: 0.5 }[position];
}

/** 此函数同时用于内容脚本和 executeScript 注入，不能引用外部运行时变量。 */
export function jumpToHeading(index: number, viewportRatio: number) {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
    (node): node is HTMLElement => node instanceof HTMLElement &&
      node.innerText.trim().replaceAll('\n', ' ').length > 0,
  );
  const heading = headings[index];
  if (!heading) return;
  heading.scrollIntoView({
    behavior: 'instant',
    block: viewportRatio === 0 ? 'start' : 'center',
    inline: 'nearest',
  });
  if (viewportRatio === 0 || viewportRatio === 0.5) return;

  // 依次调整内层滚动容器和页面，使标题中心位于各自可视区域的指定比例处。
  for (let parent = heading.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.scrollingElement || parent === document.body) continue;
    if (!/(auto|scroll|hidden|overlay)/.test(getComputedStyle(parent).overflowY)) continue;
    if (parent.scrollHeight <= parent.clientHeight) continue;
    const rect = heading.getBoundingClientRect();
    const top = parent.getBoundingClientRect().top + parent.clientTop;
    parent.scrollBy({
      top: rect.top + rect.height / 2 - top - parent.clientHeight * viewportRatio,
      behavior: 'instant',
    });
  }
  const rect = heading.getBoundingClientRect();
  window.scrollBy({ top: rect.top + rect.height / 2 - innerHeight * viewportRatio, behavior: 'instant' });
}
