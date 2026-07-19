import { useEffect, useRef } from "react";

/**
 * Dialog dismissal + focus behavior (keyboard accessibility):
 *  - moves focus into the dialog when it opens
 *  - Escape closes it
 * Attach the returned ref to the dialog panel (with tabIndex={-1}).
 */
export function useDialogDismiss<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return ref;
}
