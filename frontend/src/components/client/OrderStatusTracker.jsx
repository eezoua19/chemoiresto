import { Check } from 'lucide-react';
import { CLIENT_TIMELINE, ORDER_STATUS } from '../../utils/constants';
import { formatTime } from '../../utils/format';

/**
 * Suivi visuel de la commande cote client.
 * Les etapes franchies sont pleines, les suivantes restent grises.
 */
export default function OrderStatusTracker({ order, compact = false }) {
  if (order.status === 'CANCELLED') {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Cette commande a ete annulee. Adressez-vous a une serveuse.
      </div>
    );
  }

  const currentIndex = CLIENT_TIMELINE.indexOf(order.status);
  const timeByStatus = Object.fromEntries(
    (order.timeline || []).map((entry) => [entry.status, entry.createdAt])
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {CLIENT_TIMELINE.map((status, index) => (
          <span
            key={status}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              index <= currentIndex ? 'bg-emerald-500' : 'bg-ink-200'
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <ol className="relative space-y-0">
      {CLIENT_TIMELINE.map((status, index) => {
        const done = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const config = ORDER_STATUS[status];
        const isLast = index === CLIENT_TIMELINE.length - 1;

        return (
          <li key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition
                  ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-200 bg-white'}
                  ${isCurrent ? 'animate-pulse-ring' : ''}`}
              >
                {done ? <Check size={14} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-ink-300" />}
              </span>
              {!isLast && (
                <span className={`h-8 w-0.5 ${index < currentIndex ? 'bg-emerald-500' : 'bg-ink-200'}`} />
              )}
            </div>

            <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
              <p className={`text-sm font-semibold ${done ? 'text-ink-900' : 'text-ink-400'}`}>
                {config.clientLabel}
              </p>
              {timeByStatus[status] && (
                <p className="text-xs text-ink-400">{formatTime(timeByStatus[status])}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
