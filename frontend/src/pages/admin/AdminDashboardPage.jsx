import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  Wallet,
  Timer,
  CheckCircle2,
  Table2,
  UtensilsCrossed,
  CalendarPlus,
  BellRing,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { dashboardApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { ErrorState, PageHeader, Skeleton, StatCard, Card, CardHeader, EmptyState } from '../../components/ui';
import { formatMoney, formatShortDate, todayString } from '../../utils/format';

/** Mois en cours, au format AAAA-MM. */
function moisCourant() {
  const maintenant = new Date();
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
}

/** Decale un mois AAAA-MM de `delta` mois. */
function decalerMois(mois, delta) {
  const [annee, numero] = mois.split('-').map(Number);
  const date = new Date(annee, numero - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminDashboardPage() {
  const { restaurant } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mois, setMois] = useState(moisCourant);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await dashboardApi.stats(mois));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [mois]);

  useEffect(() => {
    load();
  }, [load]);

  // Une commande qui arrive ne doit rafraichir que le mois en cours : sinon la
  // consultation d'un mois passe sauterait sous les yeux de l'administrateur.
  const rafraichirSiMoisCourant = useCallback(() => {
    if (mois === moisCourant()) load();
  }, [mois, load]);

  useSocketEvent('new_order', rafraichirSiMoisCourant);
  useSocketEvent('order_updated', rafraichirSiMoisCourant);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const currency = restaurant?.currency || 'FCFA';
  const { today, charts, period } = stats;
  const moisSuivantPossible = mois < moisCourant();

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={
          period?.isCurrent
            ? `Activité du ${formatShortDate(today.date)}`
            : `Mois consulte : ${period?.label ?? mois}`
        }
        icon={ShoppingBag}
      />

      {/* Selecteur de mois : le mois suivant reste bloque tant qu'il n'a pas
          commence, un tableau de bord vide n'apprend rien. */}
      <Card className="mb-4 flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={() => setMois((actuel) => decalerMois(actuel, -1))}
          className="rounded-xl p-2 text-ink-600 transition hover:bg-ink-100"
          aria-label="Mois précédent"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="text-center">
          <p className="text-base font-bold text-ink-900">{period?.label ?? mois}</p>
          <p className="text-xs text-ink-600">
            {period?.orders ?? 0} commande{(period?.orders ?? 0) > 1 ? 's' : ''} -{' '}
            {formatMoney(period?.revenue ?? 0, currency)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => moisSuivantPossible && setMois((actuel) => decalerMois(actuel, 1))}
          disabled={!moisSuivantPossible}
          className="rounded-xl p-2 text-ink-600 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Mois suivant"
        >
          <ChevronRight size={20} />
        </button>
      </Card>

      {period && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Commandes du mois" value={period.orders} icon={ShoppingBag} tone="brand" />
          <StatCard
            label="Chiffre d'affaires"
            value={formatMoney(period.revenue, currency)}
            icon={Wallet}
            tone="emerald"
            hint={period.cancelled ? `${period.cancelled} annulée(s)` : undefined}
          />
          <StatCard
            label="Panier moyen"
            value={formatMoney(period.averageBasket, currency)}
            icon={TrendingUp}
            tone="sky"
          />
          <StatCard
            label="Jours avec service"
            value={`${period.daysWithService} / ${period.daysInMonth}`}
            icon={CalendarPlus}
            tone="amber"
            hint={
              period.bestDay
                ? `Meilleur jour : ${formatShortDate(period.bestDay.date)}`
                : undefined
            }
          />
        </div>
      )}

      {/* Alerte : aucun menu programme aujourd'hui */}
      {!today.menuConfigured && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <CalendarPlus size={20} className="mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Aucun menu programme aujourd&apos;hui</p>
              <p className="text-sm text-amber-700">
                Les clients qui scannent un QR Code voient un écran vide. Créez le menu du jour.
              </p>
            </div>
          </div>
          <Link to={`/admin/menus/${todayString()}`} className="btn-primary">
            Créer le menu du jour <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {today.openServiceRequests > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
          <BellRing size={20} className="text-sky-600" />
          <p className="text-sm font-medium text-sky-900">
            {today.openServiceRequests} demande(s) client en attente de traitement
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Commandes aujourd'hui" value={today.orders} icon={ShoppingBag} tone="brand" />
        <StatCard
          label="Chiffre d'affaires"
          value={formatMoney(today.revenue, currency)}
          icon={Wallet}
          tone="emerald"
        />
        <StatCard label="Commandes en attente" value={today.pending} icon={Timer} tone="amber" />
        <StatCard label="Commandes servies" value={today.served} icon={CheckCircle2} tone="sky" />
        <StatCard
          label="Tables actives"
          value={`${today.activeTables} / ${today.totalTables}`}
          icon={Table2}
          tone="indigo"
        />
        <StatCard
          label="Produits disponibles"
          value={`${today.availableProducts} / ${today.totalProducts}`}
          icon={UtensilsCrossed}
          tone="ink"
          hint={today.menuConfigured ? `${today.menuItemCount} plats au menu du jour` : undefined}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Commandes de ${period?.label ?? 'la periode'}`} />
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.daily}>
                <defs>
                  <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e4572e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#e4572e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => value.slice(8)}
                  stroke="#94a0b4"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#94a0b4" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(value) => formatShortDate(value)}
                  formatter={(value) => [value, 'Commandes']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #eef0f4', fontSize: 13 }}
                />
                <Area type="monotone" dataKey="orders" stroke="#e4572e" strokeWidth={2} fill="url(#ordersGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Chiffre d'affaires par jour" />
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => value.slice(8)}
                  stroke="#94a0b4"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#94a0b4" fontSize={12} tickLine={false} axisLine={false} width={70} />
                <Tooltip
                  labelFormatter={(value) => formatShortDate(value)}
                  formatter={(value) => [formatMoney(value, currency), 'CA']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #eef0f4', fontSize: 13 }}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Produits les plus commandes" subtitle={period?.label} />
          <div className="p-4">
            {charts.topProducts.length === 0 ? (
              <EmptyState title="Pas encore de données" description="Les statistiques apparaîtront dès les premières commandes." />
            ) : (
              <ul className="space-y-3">
                {charts.topProducts.map((product, index) => {
                  const max = charts.topProducts[0].quantity || 1;
                  return (
                    <li key={product.name}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-ink-800">
                          {index + 1}. {product.name}
                        </span>
                        <span className="shrink-0 font-semibold text-ink-600">
                          {product.quantity} vendus
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${(product.quantity / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Performance des serveuses" subtitle={period?.label} />
          <div className="p-4">
            {charts.serverPerformance.length === 0 ? (
              <EmptyState title="Pas encore de données" description="Aucune commande attribuée sur la période." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {charts.serverPerformance.map((server) => (
                  <li key={server.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="font-medium text-ink-800">{server.name}</span>
                    <span className="text-right text-sm">
                      <span className="block font-semibold text-ink-900">{server.orders} commandes</span>
                      <span className="text-xs text-ink-500">{formatMoney(server.revenue, currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
