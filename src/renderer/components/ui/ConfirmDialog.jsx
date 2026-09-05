import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';

/**
 * A destructive confirmation, shared by the delete buttons.
 *
 * They used `window.confirm`, which blocks the whole webview, cannot be styled,
 * and reads as an operating-system error rather than as part of the app.
 *
 * Rendered into `document.body` rather than in place: `.card` and `.modal-panel`
 * both set `backdrop-filter`, which makes them the containing block for any
 * fixed-position descendant, so a dialog left inside a card would be positioned
 * against the card instead of the viewport.
 */
const ConfirmDialog = ({
  isOpen,
  title,
  body,
  confirmLabel = 'Delete',
  busyLabel = 'Working…',
  // `danger` for anything that destroys a row; `primary` for a bulk write that
  // is merely worth a second look, which should not be dressed in red.
  variant = 'danger',
  icon: Icon = AlertTriangle,
  busy = false,
  onConfirm,
  onCancel
}) => {
  const id = useId();
  const panelRef = useDialog(isOpen, () => {
    if (!busy) onCancel();
  });

  if (!isOpen) return null;

  const danger = variant === 'danger';

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="modal-panel max-w-md p-5"
      >
        <div className="flex items-start gap-3">
          <span
            className={
              danger
                ? 'kpi-icon bg-[rgb(239_68_68/0.14)] text-destructive'
                : 'kpi-icon bg-[rgb(34_197_94/0.14)] text-accent'
            }
          >
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="section-title">
              {title}
            </h2>
            <p id={`${id}-body`} className="mt-1 text-sm text-muted-foreground">
              {body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {/* Focus starts on Cancel: the safe choice should be the one a stray
              Enter press lands on. */}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-autofocus
            className="btn btn-outline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {busyLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
