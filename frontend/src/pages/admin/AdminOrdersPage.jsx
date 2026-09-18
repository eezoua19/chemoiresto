import { useCallback, useEffect, useState } from 'react';
import { ShoppingBag, RefreshCw, UserPlus, Printer } from 'lucide-react';
import { orderApi, userApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import OrderCard from '../../components/orders/OrderCard';
import { printOrderTicket } from '../../components/orders/printOrder';
import useNouveautes from '../../hooks/useNouveautes';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { formatMoney } from '../../utils/format';
import { libelleProvenance } from '../../utils/order';

const COLUMNS = [
  { key: 'NEW', title: 'Nouvelles', accent: 'border-t-sky-400' },
  { key: 'ACCEPTED', title: 'Acceptées', accent: 'border-t-indigo-400' },
  { key: 'PREPARING', title: 'En préparation', accent: 'border-t-amber-400' },
  { key: 'READY', title: 'Prêtes', accent: 'border-t-emerald-400' },
];

/** Suivi en direct des commandes du jour + attribution aux serveuses. */
export default function AdminOrdersPage() {
  const { restaurant } = useAuth();
  const toast = useToast();

  const [board, setBoard] = useState(null);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignValue, setAssignValue] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [boardData, serverList] = await Promise.all([orderApi.board(), userApi.list()]);
      setBoard(boardData);
      setServers(serverList.filter((user) => user.status === 'ACTIVE'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { marquer, estNouveau } = useNouveautes();
  useSocketEvent('new_order', (order) => {
    marquer(order?.id);
    load();
  });
  useSocketEvent('order_updated', load);

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
      await orderApi.updateStatus(cancelTarget.id, 'CANCELLED', 'Annulée par l\'administrateur');
      toast.success('Commande annulée');
      setCancelTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const openAssign = (order) => {
    setAssignTarget(order);
    setAssignValue(order.server ? String(order.server.id) : '');
  };

  const submitAssign = async () => {
    setBusy(assignTarget.id);
    try {
      await orderApi.assign(assignTarget.id, assignValue ? Number(assignValue) : null);
      toast.success(assignValue ? 'Commande attribuée' : 'Attribution retirée');
      setAssignTarget(null);
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
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 xl:grid-cols-4">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const currency = restaurant?.currency || 'FCFA';
  const allOrders = Object.values(board.columns).flat();
  const pendingRevenue = allOrders.reduce((sum, order) => sum + order.total, 0);
  const isEmpty = allOrders.length === 0;

  return (
    <div>
      <PageHeader
        title="Commandes en cours"
        subtitle="Mise à jour automatique en temps réel"
        icon={ShoppingBag}
        action={
          <Button variant="secondary" icon={RefreshCw} onClick={load}>
            Actualiser
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Nouvelles" value={board.stats.new} tone="sky" />
        <StatCard label="Acceptées" value={board.stats.accepted} tone="indigo" />
        <StatCard label="En préparation" value={board.stats.preparing} tone="amber" />
        <StatCard label="Prêtes" value={board.stats.ready} tone="emerald" />
        <StatCard label="Montant en cours" value={formatMoney(pendingRevenue, currency)} tone="brand" />
      </div>

      {isEmpty ? (
        <div className="card">
          <EmptyState
            title="Aucune commande en cours"
            description="Les commandes des clients apparaîtront ici des qu'elles seront passées."
          />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const orders = board.columns[column.key] || [];
            return (
              <section key={column.key} className={`rounded-2xl border-t-4 bg-white dark:bg-ink-800 p-3 shadow-card ${column.accent}`}>
                <header className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-ink-700 dark:text-ink-200">{column.title}</h2>
                  <span className="rounded-full bg-ink-100 dark:bg-ink-800 px-2 py-0.5 text-xs font-bold text-ink-600 dark:text-ink-300">
                    {orders.length}
                  </span>
                </header>

                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <p className="rounded-xl bg-ink-50 dark:bg-ink-900 px-3 py-6 text-center text-xs text-ink-400 dark:text-ink-500">
                      Aucune commande
                    </p>
                  ) : (
                    orders.map((order) => (
                      <div key={order.id} className="space-y-2">
                        <OrderCard
                          order={order}
                          currency={currency}
                          nouveau={estNouveau(order.id)}
                          onEstimate={load}
                          busy={busy}
                          onAdvance={advance}
                          onCancel={setCancelTarget}
                          compact
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            icon={UserPlus}
                            className="flex-1 text-xs"
                            onClick={() => openAssign(order)}
                          >
                            {order.server ? order.server.firstName : 'Attribuer'}
                          </Button>
                          <Button variant="secondary" icon={Printer} onClick={() => print(order)} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title="Attribuer la commande"
        subtitle={assignTarget ? `${assignTarget.orderNumber} - ${libelleProvenance(assignTarget)}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignTarget(null)}>
              Annuler
            </Button>
            <Button onClick={submitAssign} loading={busy === assignTarget?.id}>
              Enregistrer
            </Button>
          </>
        }
      >
        <label className="label" htmlFor="assign-server">
          Serveuse
        </label>
        <Select
          id="assign-server"
          value={assignValue}
          onChange={(event) => setAssignValue(event.target.value)}
        >
          <option value="">Aucune (laisser libre)</option>
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.fullName} {server.role === 'ADMIN' ? '(admin)' : ''}
            </option>
          ))}
        </Select>
        <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
          La serveuse choisie recevra immédiatement une notification et verra la commande dans son espace.
        </p>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancel}
        title="Annuler la commande"
        message={
          cancelTarget
            ? `Annuler définitivement la commande ${cancelTarget.orderNumber} (${libelleProvenance(cancelTarget)}) ?`
            : ''
        }
        confirmLabel="Annuler la commande"
        loading={busy === cancelTarget?.id}
      />
    </div>
  );
}
