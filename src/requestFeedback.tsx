import { ActivityIndicator } from "@dev-mainsequence/command-center-sdk/feedback";
import { CircleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function RequestProgressDialog({
  message,
  open,
  title,
}: {
  message?: ReactNode;
  open: boolean;
  title: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="request-progress-backdrop" role="presentation">
      <section
        aria-busy="true"
        aria-labelledby={titleId}
        aria-modal="true"
        className="request-progress-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <ActivityIndicator aria-hidden="true" size="medium" />
        <div className="request-progress-dialog__copy">
          <h2 id={titleId}>{title}</h2>
          {message ? <p>{message}</p> : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function RequestErrorDialog({
  message,
  onClose,
  open,
  title,
}: {
  message: ReactNode;
  onClose: () => void;
  open: boolean;
  title: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="request-progress-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="request-progress-dialog request-error-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="request-error-dialog__icon" aria-hidden="true">
          <CircleAlert size={22} />
        </div>
        <div className="request-progress-dialog__copy request-error-dialog__copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{message}</p>
          <div className="request-error-dialog__actions">
            <button className="button button--secondary" type="button" onClick={onClose}>
              Dismiss
            </button>
          </div>
        </div>
        <button
          aria-label="Close error dialog"
          className="request-error-dialog__close"
          type="button"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </section>
    </div>,
    document.body,
  );
}
