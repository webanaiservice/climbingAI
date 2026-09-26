'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X, ArrowUpRight, Mountain } from 'lucide-react';
export function TrainingDialog({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="tr-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="tr-overline">CLIMBING · TRAINING</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="tr-icon-button"
          aria-label="关闭窗口"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`tr-field ${wide ? 'is-wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="tr-empty">
      <div className="tr-empty-icon">
        <Mountain size={28} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  unit,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`tr-stat ${accent ? 'is-accent' : ''}`}>
      <span>
        {label}
        <ArrowUpRight size={16} />
      </span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{detail}</p>
    </article>
  );
}
export function Pill({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`tr-pill ${tone}`}>{children}</span>;
}
