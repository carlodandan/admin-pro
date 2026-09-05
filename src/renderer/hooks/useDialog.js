import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * The modal plumbing every dialog in this app needs and none of them had:
 * Escape closes, focus moves into the panel on open and back to whatever opened
 * it on close, and Tab cycles inside the panel instead of walking the page
 * behind the backdrop.
 *
 * Returns a ref for the panel element. Mark the control that should take focus
 * first with `data-autofocus`; without it focus lands on the first focusable
 * thing in the panel, which is usually the close button.
 */
export const useDialog = (isOpen, onClose) => {
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  // Held in a ref so an inline `onClose={() => …}` prop, which is a new
  // function on every parent render, cannot re-run the effect and pull focus
  // back to the first field mid-typing. The write is in its own effect rather
  // than in the render body: mutating a ref while rendering is what
  // `react-hooks/refs` forbids, and the React Compiler is enabled here. An
  // effect with no dependency array runs after every render, so the ref is
  // current before any keystroke can reach the listener below.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement;
    const panel = panelRef.current;
    const target = panel?.querySelector('[data-autofocus]') || panel?.querySelector(FOCUSABLE);
    (target || panel)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const edge = event.shiftKey ? first : last;
      if (document.activeElement === edge || !panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Back to the control that opened the dialog: it is where the user was
      // looking, and it still exists.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [isOpen]);

  return panelRef;
};

export default useDialog;
