import { Clock, User, StickyNote, Printer, ChevronRight } from 'lucide-react';
import { ORDER_STATUS } from '../../utils/constants';
import { formatMoney, timeAgo } from '../../utils/format';
import { Button } from '../ui';

/**
 * Carte de commande utilisee par la serveuse et par l'administrateur.
 * Le bouton d'action reflete la prochaine etape autorisee du workflow.
 */
export default function OrderCard({
  order,
  currency,
  onAdvance,
  onCancel,
  onPrint,
  onOpen,
  busy,
  compact = false,
}) {
  const config = ORDER_STATUS[order.status];

  return (
    <article className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink-900">Table {order.table?.number}</h3>
            <span className={`badge ${config.badge}`}>{config.label}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-500">{order.orderNumber}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-bold text-ink-900">{formatMoney(order.total, currency)}</p>
          <p className="flex items-center justify-end gap-1 text-xs text-ink-400">
            <Clock size={11} /> {timeAgo(order.createdAt)}
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <ul className="space-y-1.5">
          {order.items.map((item) => (
            <li key={item.id} className="text-sm">
              <span className="font-semibold text-ink-900">
                {item.productName} <span className="text-brand-600">&times;{item.quantity}</span>
              </span>
              {item.options.length > 0 && (
                <span className="block text-xs text-ink-500">
                  {item.options.map((option) => option.valueName).join(', ')}
                </span>
              )}
              {item.note && (
                <span className="block text-xs italic text-amber-700">&laquo; {item.note} &raquo;</span>
              )}
            </li>
          ))}
        </ul>

        {order.comment && (
          <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <StickyNote size={14} className="mt-0.5 shrink-0" />
            {order.comment}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          {order.customerName && (
            <span className="inline-flex items-center gap-1">
              <User size={12} /> {order.customerName}
            </span>
          )}
          {order.server && (
            <span className="inline-flex items-center gap-1">
              Serveuse : <span className="font-medium text-ink-700">{order.server.firstName}</span>
            </span>
          )}
        </div>
      </div>

      {(onAdvance || onCancel || onPrint || onOpen) && (
        <div className="flex flex-wrap gap-2 border-t border-ink-100 px-4 py-3">
          {onAdvance && config.next && (
            <Button
              onClick={() => onAdvance(order, config.next)}
              loading={busy === order.id}
              className="flex-1"
            >
              {config.nextLabel}
            </Button>
          )}

          {onOpen && (
            <Button variant="secondary" onClick={() => onOpen(order)} icon={ChevronRight}>
              Detail
            </Button>
          )}

          {onPrint && !compact && (
            <Button variant="secondary" onClick={() => onPrint(order)} icon={Printer}>
              Imprimer
            </Button>
          )}

          {onCancel && config.next && (
            <Button variant="ghost" onClick={() => onCancel(order)} className="text-red-600 hover:bg-red-50">
              Annuler
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
