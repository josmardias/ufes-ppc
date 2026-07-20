// Generic confirm/alert dialog (UC-05 delete confirmation, UC-06 import
// overwrite confirmation and error messages). Uses the native <dialog>
// element per docs/ARCHITECTURE.md ("src/components").

import { useEffect, useRef } from 'react';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string|null,
 *   danger?: boolean,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} props
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else if (ref.current?.open) ref.current.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="overscroll-contain rounded-lg p-0 backdrop:bg-slate-900/40"
    >
      <div className="flex w-80 flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-700 text-pretty">{message}</p>

        <div className="flex justify-end gap-2">
          {cancelLabel && (
            <button
              type="button"
              onClick={onCancel}
              className={`rounded px-3 py-1 text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1 text-white ${BUTTON_FOCUS_CLASS} ${
              danger
                ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
                : 'bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
