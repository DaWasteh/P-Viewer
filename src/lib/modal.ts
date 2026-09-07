/** Native modality makes the entire app inert and supplies keyboard focus containment. */
export function modal(node: HTMLDialogElement) {
  const previous = document.activeElement;
  const preventCancel = (event: Event) => event.preventDefault();
  const containTab = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const targets = Array.from(node.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
    const first = targets[0], last = targets[targets.length - 1];
    if (!first) { event.preventDefault(); node.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) {
      event.preventDefault(); first.focus();
    }
  };
  node.addEventListener("cancel", preventCancel);
  node.addEventListener("keydown", containTab);
  node.showModal();
  return { destroy() {
    node.removeEventListener("cancel", preventCancel);
    node.removeEventListener("keydown", containTab);
    node.close();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  } };
}
