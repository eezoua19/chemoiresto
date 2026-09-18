import { Clock, User, StickyNote, Printer, ChevronRight, ShoppingBag, Phone } from 'lucide-react';
import { ORDER_STATUS } from '../../utils/constants';
import { formatMoney, timeAgo } from '../../utils/format';
import { estAEmporter } from '../../utils/order';
import { Button } from '../ui';
import TempsAnnonce from './TempsAnnonce';

/**
 * Carte de commande utilisée par la serveuse et par l'administrateur.
 * Le bouton d'action reflete la prochaine étape autorisée du workflow.
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
  nouveau = false,
  onEstimate,
}) {
  const config = ORDER_STATUS[order.status];
  const emporter = estAEmporter(order);

  return (
    <article className={`card overflow-hidden ${nouveau ? 'animate-surlignage' : ''}`}>
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 dark:border-ink-700 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {emporter ? (
              // Le code de retrait est ce que la serveuse annonce à voix haute :
              // il doit se lire d'un coup d'oeil, comme un numéro de table.
              <h3 className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-ink-50">
                <ShoppingBag size={15} className="text-brand-600" />
                Emporter
                <span className="rounded-lg bg-brand-100 dark:bg-brand-900/40 px-2 py-0.5 tracking-widest text-brand-800 dark:text-brand-300">
                  {order.pickupCode}
                </span>
              </h3>
            ) : (
              <h3 className="font-bold text-ink-900 dark:text-ink-50">Table {order.table?.number}</h3>
            )}
            <span className={`badge ${config.badge}`}>{config.label}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">{order.orderNumber}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-bold text-ink-900 dark:text-ink-50">{formatMoney(order.total, currency)}</p>
          <p className="flex items-center justify-end gap-1 text-xs text-ink-400 dark:text-ink-500">
            <Clock size={11} /> {timeAgo(order.createdAt)}
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <ul className="space-y-1.5">
          {order.items.map((item) => (
            <li key={item.id} className="text-sm">
              <span className="font-semibold text-ink-900 dark:text-ink-50">
                {item.productName} <span className="text-brand-600">&times;{item.quantity}</span>
              </span>
              {item.options.length > 0 && (
                <span className="block text-xs text-ink-500 dark:text-ink-400">
                  {item.options.map((option) => option.valueName).join(', ')}
                </span>
              )}
              {item.note && (
                <span className="block text-xs italic text-amber-700 dark:text-amber-400">&laquo; {item.note} &raquo;</span>
              )}
            </li>
          ))}
        </ul>

        {order.comment && (
          <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <StickyNote size={14} className="mt-0.5 shrink-0" />
            {order.comment}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
          {order.customerName && (
            <span className="inline-flex items-center gap-1">
              <User size={12} /> {order.customerName}
            </span>
          )}
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            >
              <Phone size={12} /> {order.customerPhone}
            </a>
          )}
          {order.server && (
            <span className="inline-flex items-center gap-1">
              Serveuse : <span className="font-medium text-ink-700 dark:text-ink-200">{order.server.firstName}</span>
            </span>
          )}
        </div>
      </div>

      {/* Le temps annoncé se décide en lisant la commande, pas en la
          clôturant : il vit donc entre le détail et les actions. */}
      {onEstimate && <TempsAnnonce order={order} onChange={onEstimate} />}

      {(onAdvance || onCancel || onPrint || onOpen) && (
        <div className="flex flex-wrap gap-2 border-t border-ink-100 dark:border-ink-700 px-4 py-3">
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
              Détail
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
