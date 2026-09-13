import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { publicApi } from '../../services/endpoints';
import { connectSocket } from '../../services/socket';
import useSocketEvent from '../../hooks/useSocketEvent';
import OrderStatusTracker from '../../components/client/OrderStatusTracker';
import { EmptyState, ErrorState, Footer, LoadingState } from '../../components/ui';
import { formatDateTime, formatMoney } from '../../utils/format';
import { ORDER_STATUS } from '../../utils/constants';
import { libelleProvenance } from '../../utils/order';

/** Suivi en temps réel d'une commande, accessible via son jeton. */
export default function OrderTrackingPage() {
  const { trackingToken } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrder(await publicApi.trackOrder(trackingToken));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [trackingToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = connectSocket(null);
    const join = () => socket.emit('track_order', trackingToken);
    join();
    socket.on('connect', join);
    return () => {
      socket.emit('untrack_order', trackingToken);
      socket.off('connect', join);
    };
  }, [trackingToken]);

  useSocketEvent('order_status', (updated) => {
    if (updated.trackingToken === trackingToken) setOrder(updated);
  });

  if (loading) return <LoadingState label="Chargement de votre commande..." />;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
        <div className="w-full max-w-sm">
          {error.status === 404 ? (
            <EmptyState
              icon={ReceiptText}
              title="Commande introuvable"
              description="Ce lien de suivi n'est plus valide."
            />
          ) : (
            <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
          )}
        </div>
      </div>
    );
  }

  const config = ORDER_STATUS[order.status];

  return (
    <div className="min-h-screen bg-ink-50 pb-10">
      <header
        className="motif-cuisine px-5 pb-8 pt-6 text-white"
        style={{ background: 'linear-gradient(160deg, var(--brand) 0%, var(--brand-dark) 100%)' }}
      >
        <div className="mx-auto max-w-lg">
          <Link
            to={order.table ? `/menu/table/${order.tableToken || ''}` : '/'}
            onClick={(event) => {
              event.preventDefault();
              window.history.length > 1 ? window.history.back() : (window.location.href = '/');
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
          >
            <ArrowLeft size={16} /> Retour au menu
          </Link>

          <p className="mt-5 text-xs uppercase tracking-wide text-white/70">Votre commande</p>
          <h1 className="text-2xl font-extrabold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-white/85">
            {libelleProvenance(order)} - {formatDateTime(order.createdAt)}
          </p>
        </div>
      </header>

      <div className="mx-auto -mt-4 max-w-lg space-y-4 px-4">
        <section className="card animate-entree p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Suivi</h2>
            <span className={`badge ${config.badge}`}>{config.clientLabel}</span>
          </div>
          <OrderStatusTracker order={order} />
          {order.server && (
            <p className="mt-4 rounded-xl bg-ink-50 px-4 py-2.5 text-sm text-ink-600">
              Votre serveuse : <span className="font-semibold text-ink-900">{order.server.firstName}</span>
            </p>
          )}
        </section>

        <section className="card animate-entree p-5" style={{ animationDelay: '90ms' }}>
          <h2 className="mb-3 font-semibold text-ink-900">Détail</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {item.productName} <span className="text-ink-400">&times;{item.quantity}</span>
                  </p>
                  {item.options.length > 0 && (
                    <p className="text-xs text-ink-500">
                      {item.options.map((option) => option.valueName).join(', ')}
                    </p>
                  )}
                  {item.note && <p className="text-xs italic text-ink-500">&laquo; {item.note} &raquo;</p>}
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink-900">
                  {formatMoney(item.lineTotal, order.currency)}
                </span>
              </li>
            ))}
          </ul>

          {order.comment && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              Commentaire : {order.comment}
            </p>
          )}

          <div className="mt-4 flex justify-between border-t border-ink-100 pt-4 text-lg font-bold text-ink-900">
            <span>Total</span>
            <span>{formatMoney(order.total, order.currency)}</span>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
