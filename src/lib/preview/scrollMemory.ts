/**
 * Keeps a preview's scroll offset in `memory` and restores it when the preview
 * is mounted again (tab switch, mode change, session restore). Content often
 * appears after mount (debounced Markdown, lazily loaded previews), so the
 * restore waits until the scroller is tall enough, gives up after a few
 * seconds and never fights a user who already started scrolling.
 */
export function rememberScroll(node: HTMLElement, memory: { top: number } | undefined) {
  let current = memory;
  let restored = false;
  let frame = 0;
  const started = performance.now();

  const finish = () => {
    restored = true;
    cancelAnimationFrame(frame);
  };

  const attempt = () => {
    if (restored) return;
    const top = current?.top ?? 0;
    if (top <= 0) return finish();
    if (node.scrollHeight - node.clientHeight >= top - 1) {
      node.scrollTo({ top, behavior: "instant" });
      return finish();
    }
    if (performance.now() - started > 4_000) return finish();
    frame = requestAnimationFrame(attempt);
  };

  const onScroll = () => {
    if (restored && current) current.top = node.scrollTop;
  };
  const onUserScroll = () => finish();

  node.addEventListener("scroll", onScroll, { passive: true });
  node.addEventListener("wheel", onUserScroll, { passive: true });
  node.addEventListener("pointerdown", onUserScroll);
  node.addEventListener("keydown", onUserScroll);
  frame = requestAnimationFrame(attempt);

  return {
    update(next: { top: number } | undefined) {
      current = next;
    },
    destroy() {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("wheel", onUserScroll);
      node.removeEventListener("pointerdown", onUserScroll);
      node.removeEventListener("keydown", onUserScroll);
    },
  };
}
