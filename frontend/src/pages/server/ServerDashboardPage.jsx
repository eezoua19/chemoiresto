import { useCallback, useEffect, useState } from 'react';
import { Inbox, ChefHat, CheckCircle2, ClipboardCheck, RefreshCw, LayoutGrid } from 'lucide-react';
import { orderApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import useNouveautes from '../../hooks/useNouveautes';
import OrderCard from '../../components/orders/OrderCard';
import { printOrderTicket } from '../../components/orders/printOrder';
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui';
import { libelleProvenance } from '../../utils/order';

const COLUMNS = [
  { key: 'NEW', title: 'Nouvelles', accent: 'border-t-sky-400' },
  { key: 'ACCEPTED', title: 'Acceptées', accent: 'border-t-indigo-400' },
  { key: 'PREPARING', title: 'En préparation', accent: 'border-t-amber-400' },
  { key: 'READY', title: 'Prêtes', accent: 'border-t-emerald-400' },
];

/** Tableau Kanban temps réel de la serveuse. */
export default function ServerDashboardPage() {
  const { user, restaurant } = useAuth();
  const toast = useToast();

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBoard(await orderApi.board());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Le surlignage dit laquelle vient d'arriver, ce qu'aucune alerte ne peut
  // faire dans un tableau de douze cartes.
  const { marquer, estNouveau } = useNouveautes();
  useSocketEvent('new_order', (order) => {
    marquer(order?.id);
    load();
  });
  useSocketEvent('order_updated', load);
  useSocketEvent('order_assigned', load);

  const advance = async (order, nextStatus) => {
    setBusy(order.id);
    try {
      await orderApi.updateStatus(order.id, nextStatus);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy(cancelTarget.id);
    try {
      await orderApi.updateStatus(cancelTarget.id, 'CANCELLED', 'Annulée par la serveuse');
      toast.success('Commande annulée');
      setCancelTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const print = (order) => {
    try {
      printOrderTicket(order, restaurant);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const currency = restaurant?.currency || 'FCFA';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Bonjour ${user?.firstName || ''}`}
        subtitle="Commandes en cours aujourd'hui"
        icon={LayoutGrid}
        action={
          <Button variant="secondary" icon={RefreshCw} onClick={load}>
            Actualiser
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Nouvelles" value={board.stats.new} icon={Inbox} tone="sky" />
        <StatCard label="En préparation" value={board.stats.preparing} icon={ChefHat} tone="amber" />
        <StatCard label="Prêtes" value={board.stats.ready} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Servies" value={board.stats.served} icon={ClipboardCheck} tone="ink" />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((column) => {
          const orders = board.columns[column.key] || [];
          return (
            <section key={column.key} className={`rounded-2xl border-t-4 bg-white p-3 shadow-card ${column.accent}`}>
              <header className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-700">{column.title}</h2>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600">
                  {orders.length}
                </span>
              </header>

              <div className="space-y-3">
                {orders.length === 0 ? (
                  <p className="rounded-xl bg-ink-50 px-3 py-6 text-center text-xs text-ink-400">
                    Aucune commande
                  </p>
                ) : (
                  orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      nouveau={estNouveau(order.id)}
                      currency={currency}
                      busy={busy}
                      onAdvance={advance}
                      onCancel={setCancelTarget}
                      onPrint={print}
                      compact
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {Object.values(board.columns).every((column) => column.length === 0) && (
        <div className="card">
          <EmptyState
            title="Aucune commande en cours"
            description="Les nouvelles commandes apparaîtront ici automatiquement, avec une alerte sonore."
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancel}
        title="Annuler la commande"
        message={
          cancelTarget
            ? `Voulez-vous vraiment annuler la commande ${cancelTarget.orderNumber} (${libelleProvenance(cancelTarget)}) ? Cette action est définitive.`
            : ''
        }
        confirmLabel="Annuler la commande"
        loading={busy === cancelTarget?.id}
      />
    </div>
  );
}
