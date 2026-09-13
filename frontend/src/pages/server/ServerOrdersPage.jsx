import { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { orderApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import useNouveautes from '../../hooks/useNouveautes';
import OrderCard from '../../components/orders/OrderCard';
import { printOrderTicket } from '../../components/orders/printOrder';
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui';
import { ORDER_STATUS, PERIOD_OPTIONS } from '../../utils/constants';

/** Liste filtrable de toutes les commandes visibles par la serveuse. */
export default function ServerOrdersPage() {
  const { restaurant } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState({
    period: 'today',
    status: '',
    type: '',
    search: '',
    mine: 'false',
  });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { period: filters.period, pageSize: 100 };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.mine === 'true') params.mine = 'true';

      const result = await orderApi.list(params);
      setOrders(result.orders);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  // Le son et la voix disent qu'une commande arrive ; le surlignage dit
  // laquelle, ce qu'aucune alerte ne peut faire dans une liste de douze cartes.
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

  const print = (order) => {
    try {
      printOrderTicket(order, restaurant);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink-900">Commandes</h1>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Actualiser
        </Button>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="N. commande, table, client..."
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </div>

        <Select
          value={filters.period}
          onChange={(event) => setFilters({ ...filters, period: event.target.value })}
        >
          {PERIOD_OPTIONS.filter((option) => option.value !== 'custom').map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
        >
          <option value="">Tous les statuts</option>
          {Object.values(ORDER_STATUS).map((status) => (
            <option key={status.key} value={status.key}>
              {status.label}
            </option>
          ))}
        </Select>

        <Select
          value={filters.type}
          onChange={(event) => setFilters({ ...filters, type: event.target.value })}
        >
          <option value="">Salle et emporter</option>
          <option value="DINE_IN">En salle seulement</option>
          <option value="TAKEAWAY">À emporter seulement</option>
        </Select>

        <Select
          value={filters.mine}
          onChange={(event) => setFilters({ ...filters, mine: event.target.value })}
        >
          <option value="false">Toutes les serveuses</option>
          <option value="true">Mes commandes</option>
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : orders.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Aucune commande"
            description="Aucune commande ne correspond à ces filtres."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              nouveau={estNouveau(order.id)}
              currency={restaurant?.currency}
              busy={busy}
              onAdvance={advance}
              onPrint={print}
            />
          ))}
        </div>
      )}
    </div>
  );
}
