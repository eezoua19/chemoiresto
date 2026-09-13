import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Inbox, WifiOff, ShieldAlert, SearchX } from 'lucide-react';
import usePresence from '../../hooks/usePresence';

// ------------------------------- Bouton ------------------------------------

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
};

export function Button({
  variant = 'primary',
  loading = false,
  icon: Icon,
  children,
  className = '',
  disabled,
  ...props
}) {
  return (
    <button
      className={`${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

// -------------------------------- Carte ------------------------------------

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 rounded-lg bg-brand-50 p-2 text-brand-600">
            <Icon size={18} />
          </span>
        )}
        <div>
          <h3 className="text-base font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// -------------------------------- Badge ------------------------------------

export function Badge({ className = '', children }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

// ------------------------------- Champs ------------------------------------

export function Field({ label, error, hint, required, children }) {
  return (
    <div>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-brand-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`input ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`input ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 disabled:opacity-50"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-emerald-500' : 'bg-ink-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
      {label && <span className="text-sm text-ink-700">{label}</span>}
    </button>
  );
}

// -------------------------------- Modal ------------------------------------

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  // La fenetre reste montee le temps de sortir de l'ecran.
  const { monte, sortant } = usePresence(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!monte) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className={`absolute inset-0 bg-ink-900/50 backdrop-blur-sm ${
          sortant ? 'animate-fade-out' : 'animate-fade-in'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92vh] w-full ${sizes[size]} flex-col rounded-t-2xl
                    bg-white shadow-float sm:rounded-2xl ${
                      sortant
                        ? 'animate-sheet-out sm:animate-slide-down'
                        : 'animate-sheet-in sm:animate-slide-up'
                    }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmer',
  message,
  confirmLabel = 'Confirmer',
  variant = 'danger',
  loading,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{message}</p>
    </Modal>
  );
}

// ------------------------------- Etats -------------------------------------

export function Spinner({ size = 24, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-brand-500 ${className}`} />;
}

export function LoadingState({ label = 'Chargement...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-500">
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="rounded-2xl bg-ink-100 p-4 text-ink-400">
        <Icon size={28} />
      </span>
      <div>
        <h3 className="text-base font-semibold text-ink-800">{title}</h3>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, isNetwork }) {
  return (
    <EmptyState
      icon={isNetwork ? WifiOff : ShieldAlert}
      title={isNetwork ? 'Connexion impossible' : 'Une erreur est survenue'}
      description={message}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Réessayer
          </Button>
        )
      }
    />
  );
}

export function NoResults({ description = 'Essayez de modifier vos filtres de recherche.' }) {
  return <EmptyState icon={SearchX} title="Aucun résultat" description={description} />;
}

// ------------------------------- Divers ------------------------------------

export function PageHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="rounded-xl bg-white p-2.5 text-brand-600 shadow-card">
            <Icon size={22} />
          </span>
        )}
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    ink: 'bg-ink-100 text-ink-600',
  };

  return (
    <div className="card flex items-center gap-4 p-4">
      {Icon && (
        <span className={`rounded-xl p-3 ${tones[tone]}`}>
          <Icon size={20} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-ink-900">{value}</p>
        {hint && <p className="truncate text-xs text-ink-400">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Signature affichée au bas de toutes les pages.
 *
 * Centralisee ici : le jour ou le texte change, il n'y a qu'un seul endroit a
 * modifier.
 */
export function Footer({ className = '' }) {
  // La couleur est portee par le <footer> et heritee : une page a fond sombre
  // passe simplement className="text-white/70" pour rester lisible.
  //
  // ink-600 et non ink-400 : sur le fond clair, ink-400 tombe a 2,5:1 de
  // contraste, illisible sur un téléphone en plein soleil. ink-600 donne 6,5:1.
  return (
    <footer className={`px-4 py-5 text-center text-xs text-ink-600 ${className}`}>
      <p>
        Fait par <span className="font-semibold">Emmanuel Ezoua</span> - EZ DIGITAL
      </p>
    </footer>
  );
}
