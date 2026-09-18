import { useCallback, useEffect, useState } from 'react';
import { History, Search, Printer, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { orderApi, tableApi, userApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { printOrderTicket } from '../../components/orders/printOrder';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { ORDER_STATUS, PERIOD_OPTIONS } from '../../utils/constants';
import { formatDateTime, formatMoney } from '../../utils/format';
import { libelleCourt, libelleProvenance } from '../../utils/order';

const INITIAL_FILTERS = {
  period: 'today',
  from: '',
  to: '',
  status: '',
  tableId: '',
  serverId: '',
  search: '',
};

/** Historique complet des commandes, avec filtres et recherche. */
export default function AdminHistoryPage() {
  const { restaurant } = useAuth();
  const toast = useToast();
  const currency = restaurant?.currency || 'FCFA';

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [tables, setTables] = useState([]);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    Promise.all([tableApi.list(), userApi.list()])
      .then(([tableList, serverList]) => {
        setTables(tableList);
        setServers(serverList);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { page, pageSize: 25, period: filters.period };
      if (filters.period === 'custom') {
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = filters.to;
      }
      if (filters.status) params.status = filters.status;
      if (filters.tableId) params.tableId = filters.tableId;
      if (filters.serverId) params.serverId = filters.serverId;
      if (filters.search.trim()) params.search = filters.search.trim();

      setResult(await orderApi.list(params));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  const updateFilter = (patch) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const print = (order) => {
    try {
      printOrderTicket(order, restaurant);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const orders = result?.orders || [];
  const pagination = result?.pagination;
  const revenue = orders
    .filter((order) => order.status !== 'CANCELLED')
    .reduce((sum, order) => sum + order.total, 0);

  return (
    <div>
      <PageHeader title="Historique des commandes" subtitle="Filtrez et retrouvez toutes les commandes" icon={History} />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
            <Input
              className="pl-9"
              placeholder="N. commande, table, client..."
              value={filters.search}
              onChange={(event) => updateFilter({ search: event.target.value })}
            />
          </div>

          <Select value={filters.period} onChange={(event) => updateFilter({ period: event.target.value })}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select value={filters.status} onChange={(event) => updateFilter({ status: event.target.value })}>
            <option value="">Tous les statuts</option>
            {Object.values(ORDER_STATUS).map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>

          <Select value={filters.tableId} onChange={(event) => updateFilter({ tableId: event.target.value })}>
            <option value="">Toutes les tables</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                Table {table.number}
              </option>
            ))}
          </Select>

          <Select value={filters.serverId} onChange={(event) => updateFilter({ serverId: event.target.value })}>
            <option value="">Toutes les serveuses</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.fullName}
              </option>
            ))}
          </Select>

          {filters.period === 'custom' && (
            <>
              <Input
                type="date"
                value={filters.from}
                onChange={(event) => updateFilter({ from: event.target.value })}
              />
              <Input
                type="date"
                value={filters.to}
                onChange={(event) => updateFilter({ to: event.target.value })}
              />
            </>
          )}

          <Button variant="secondary" onClick={() => updateFilter(INITIAL_FILTERS)}>
            Réinitialiser les filtres
          </Button>
        </div>
      </Card>

      {pagination && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Commandes trouvées" value={pagination.total} tone="brand" />
          <StatCard label="CA sur cette page" value={formatMoney(revenue, currency)} tone="emerald" />
          <StatCard
            label="Page"
            value={`${pagination.page} / ${pagination.totalPages}`}
            tone="ink"
          />
        </div>
      )}

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState title="Aucune commande" description="Aucune commande ne correspond à ces critères." />
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 dark:border-ink-700 text-left text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
                  <th className="px-4 py-3 font-semibold">Commande</th>
                  <th className="px-4 py-3 font-semibold">Origine</th>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Serveuse</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900 dark:text-ink-50">{order.orderNumber}</p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{formatDateTime(order.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">{libelleCourt(order)}</td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">{order.customerName || '-'}</td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">{order.server?.fullName || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${ORDER_STATUS[order.status].badge}`}>
                        {ORDER_STATUS[order.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink-900 dark:text-ink-50">
                      {formatMoney(order.total, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDetail(order)}
                          className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700"
                          aria-label="Voir le détail"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => print(order)}
                          className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-700"
                          aria-label="Imprimer"
                        >
                          <Printer size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                icon={ChevronLeft}
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Précédent
              </Button>
              <span className="px-3 text-sm text-ink-600 dark:text-ink-300">
                Page {pagination.page} sur {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Suivant <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}

      {/* -------------------------- Detail ---------------------------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.orderNumber}
        subtitle={detail ? `${libelleProvenance(detail)} - ${formatDateTime(detail.createdAt)}` : ''}
        footer={
          detail && (
            <Button icon={Printer} onClick={() => print(detail)}>
              Imprimer le ticket
            </Button>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <ul className="divide-y divide-ink-100 dark:divide-ink-700">
              {detail.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                      {item.productName} <span className="text-ink-400 dark:text-ink-500">&times;{item.quantity}</span>
                    </p>
                    {item.options.length > 0 && (
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        {item.options
                          .map((option) => `${option.optionName} : ${option.valueName}`)
                          .join(' - ')}
                      </p>
                    )}
                    {item.note && <p className="text-xs italic text-ink-500 dark:text-ink-400">&laquo; {item.note} &raquo;</p>}
                    <p className="text-xs text-ink-400 dark:text-ink-500">
                      Prix unitaire au moment de la commande : {formatMoney(item.unitPrice, currency)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {formatMoney(item.lineTotal, currency)}
                  </span>
                </li>
              ))}
            </ul>

            {detail.comment && (
              <p className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                Commentaire : {detail.comment}
              </p>
            )}

            <div className="flex justify-between border-t border-ink-100 dark:border-ink-700 pt-4 text-lg font-bold text-ink-900 dark:text-ink-50">
              <span>Total</span>
              <span>{formatMoney(detail.total, currency)}</span>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-ink-900 dark:text-ink-50">Historique des statuts</h3>
              <ul className="space-y-2">
                {detail.statusHistory.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${ORDER_STATUS[entry.status].dot}`} />
                    <span className="font-medium text-ink-800 dark:text-ink-100">{ORDER_STATUS[entry.status].label}</span>
                    <span className="text-xs text-ink-500 dark:text-ink-400">{formatDateTime(entry.createdAt)}</span>
                    {entry.user && <span className="text-xs text-ink-400 dark:text-ink-500">par {entry.user.fullName}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
