import { useState } from 'react';
import { Timer, Check } from 'lucide-react';
import { orderApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { formatTime } from '../../utils/format';

/**
 * Les durées qu'on annonce vraiment dans un maquis.
 * On commence à 5 minutes : une boisson ou un plat déjà prêt n'attend pas dix.
 */
const CHOIX = [5, 10, 15, 20, 30, 45];

/**
 * Le temps d'attente annoncé au client, posé par la serveuse.
 *
 * Pourquoi elle et pas un calcul : une moyenne ne voit pas que le braiseur est
 * déjà plein, ni qu'il ne reste qu'un poisson. Elle, si. Et un temps annoncé
 * par quelqu'un engage ce quelqu'un — c'est ce qui le rend fiable.
 *
 * Cinq durées, un doigt : en plein service, un champ de saisie ne serait
 * jamais utilisé.
 */
export default function TempsAnnonce({ order, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  // Une commande terminée ou annulée n'attend plus rien.
  if (['SERVED', 'CANCELLED'].includes(order.status)) return null;

  const annoncer = async (minutes) => {
    setBusy(minutes);
    try {
      const misAJour = await orderApi.setEstimate(order.id, minutes);
      toast.success(
        minutes === 0 ? 'Temps retiré' : `Le client voit « environ ${minutes} min »`
      );
      onChange?.(misAJour);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  };

  const annonce = order.estimatedMinutes;

  return (
    <div className="border-t border-ink-100 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500">
          <Timer size={13} />
          {annonce ? 'Annoncé au client' : 'Annoncer au client'}
        </span>

        {annonce ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
              <Check size={12} /> {annonce} min
              {order.estimatedReadyAt && (
                <span className="font-medium text-emerald-700">
                  · vers {formatTime(order.estimatedReadyAt)}
                </span>
              )}
            </span>

            {/* Rallonger se fait d'un doigt : la cuisine prend du retard plus
                souvent qu'elle ne gagne du temps. */}
            <div className="flex gap-1">
              {CHOIX.filter((minutes) => minutes !== annonce).map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => annoncer(minutes)}
                  disabled={busy !== null}
                  className="rounded-lg border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                >
                  {minutes}
                </button>
              ))}
              <button
                type="button"
                onClick={() => annoncer(0)}
                disabled={busy !== null}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-400 transition hover:text-red-600 disabled:opacity-50"
              >
                Retirer
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-1">
            {CHOIX.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => annoncer(minutes)}
                disabled={busy !== null}
                className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
              >
                {busy === minutes ? '...' : `${minutes} min`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
