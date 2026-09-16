import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { publicApi } from '../../services/endpoints';
import useSocketEvent from '../../hooks/useSocketEvent';
import useSocketRoom from '../../hooks/useSocketRoom';
import useClientPushSubscription from '../../hooks/useClientPushSubscription';
import OrderJourneyTracker from '../../components/client/OrderJourneyTracker';
import Confettis from '../../components/client/Confettis';
import TempsDAttente from '../../components/client/TempsDAttente';
import LoyaltyCard from '../../components/client/LoyaltyCard';
import ReviewForm from '../../components/client/ReviewForm';
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

  useSocketRoom('track_order', trackingToken, 'untrack_order');
  useClientPushSubscription(trackingToken);

  // Le moment qu'on attend : le plat est pret. On ne fete que le passage,
  // pas l'etat - rouvrir la page une heure plus tard ne doit pas relancer la
  // gerbe comme si l'evenement venait d'arriver.
  const [fete, setFete] = useState(false);
  useSocketEvent('order_status', (updated) => {
    if (updated.trackingToken !== trackingToken) return;
    const devientPrete = updated.status === 'READY' && order?.status !== 'READY';
    setOrder(updated);
    if (devientPrete) {
      setFete(true);
      // Une vibration courte : dans un maquis bruyant, l'ecran ne suffit pas.
      try {
        navigator.vibrate?.([25, 60, 35]);
      } catch {
        // Vibration refusee ou indisponible : l'ecran fait le travail.
      }
      setTimeout(() => setFete(false), 2200);
    }
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
          <div className="flex items-center justify-between">
            <Link
              to={order.table ? `/menu/table/${order.table.token || ''}` : '/'}
              onClick={(event) => {
                event.preventDefault();
                window.history.length > 1 ? window.history.back() : (window.location.href = '/');
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
            >
              <ArrowLeft size={16} /> Retour au menu
            </Link>
            <Link
              to="/mes-commandes"
              className="text-sm font-medium text-white/85 hover:text-white"
            >
              Mes commandes
            </Link>
          </div>

          <p className="mt-5 text-xs uppercase tracking-wide text-white/70">Votre commande</p>
          <h1 className="text-2xl font-extrabold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-white/85">
            {libelleProvenance(order)} - {formatDateTime(order.createdAt)}
          </p>
        </div>
      </header>

      <div className="mx-auto -mt-4 max-w-lg space-y-4 px-4">
        <section className="card relative animate-entree p-5">
          <Confettis actif={fete} />

          {order.status === 'READY' && (
            <div className="mb-4 animate-pop rounded-2xl bg-emerald-500 px-4 py-3 text-center text-white">
              <p className="text-lg font-extrabold leading-tight">VOTRE PLAT EST PRÊT</p>
              <p className="text-xs text-white/85">
                {libelleProvenance(order).startsWith('Table')
                  ? 'La serveuse arrive avec votre commande.'
                  : 'Présentez votre code au comptoir.'}
              </p>
            </div>
          )}

          <div className="mb-4">
            <TempsDAttente order={order} />
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Suivi</h2>
            <span className={`badge ${config.badge}`}>{config.clientLabel}</span>
          </div>
          <OrderJourneyTracker order={order} />
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

        {order.status === 'SERVED' && (
          <section className="animate-entree space-y-3" style={{ animationDelay: '150ms' }}>
            <LoyaltyCard loyalty={order.loyalty} />
            <ReviewForm
              trackingToken={trackingToken}
              review={order.review}
              onSubmitted={(review) => setOrder((current) => ({ ...current, review }))}
            />
          </section>
        )}
      </div>

      <Footer />
    </div>
  );
}
