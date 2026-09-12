import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

/** Systeme de notifications ephemeres (toasts) accessible partout. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Les rappels de fermeture vivent hors de l'etat : les declencher depuis une
  // fonction de mise a jour les ferait partir deux fois en mode strict.
  const rappels = useRef(new Map());

  const dismiss = useCallback((id) => {
    const rappel = rappels.current.get(id);
    if (rappel) {
      rappels.current.delete(id);
      rappel();
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', duration = 4000, onDismiss) => {
      const id = Date.now() + Math.random();
      if (onDismiss) rappels.current.set(id, onDismiss);
      setToasts((current) => [...current, { id, message, type, persistant: !duration }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, duration) => push(message, 'success', duration),
      error: (message, duration) => push(message, 'error', duration ?? 6000),
      info: (message, duration) => push(message, 'info', duration),
      warning: (message, duration) => push(message, 'warning', duration),
      /**
       * Alerte du personnel : reste affichee jusqu'a fermeture manuelle.
       * `onDismiss` sert a couper l'annonce vocale au meme moment.
       */
      alerte: (message, type = 'warning', onDismiss) => push(message, type, 0, onDismiss),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border px-4 py-3 shadow-float ${
                STYLES[toast.type]
              }`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{toast.message}</p>
                {toast.persistant && (
                  // La voix se coupe au moindre contact : encore faut-il le savoir.
                  <p className="mt-0.5 text-xs opacity-70">
                    Touchez l&apos;écran pour couper la voix
                  </p>
                )}
              </div>
              {toast.persistant ? (
                // Une alerte persistante coupe aussi l'annonce vocale : le bouton
                // doit etre atteignable du pouce, pas une petite croix.
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 self-center rounded-lg border border-current/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:bg-black/5"
                >
                  J&apos;ai vu
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 opacity-60 transition hover:opacity-100"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast doit etre utilise dans un ToastProvider');
  return context;
}
