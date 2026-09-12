import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { dashboardApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { formatMoney, formatShortDate } from '../../utils/format';

const COLORS = ['#e4572e', '#f0a202', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

/** Statistiques detaillees du restaurant. */
export default function AdminStatsPage() {
  const { restaurant } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await dashboardApi.stats());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-80 rounded-2xl" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const currency = restaurant?.currency || 'FCFA';
  const { charts } = stats;
  const hasData = charts.topProducts.length > 0;

  return (
    <div>
      <PageHeader
        title="Statistiques"
        subtitle="Analyse de l'activite du restaurant"
        icon={BarChart3}
        action={
          <Button variant="secondary" icon={RefreshCw} onClick={load}>
            Actualiser
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader title="Evolution sur 14 jours" subtitle="Commandes et chiffre d'affaires" />
        <div className="h-80 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => value.slice(5)}
                stroke="#94a0b4"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke="#e4572e"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#10b981"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                labelFormatter={(value) => formatShortDate(value)}
                formatter={(value, name) =>
                  name === 'revenue' ? [formatMoney(value, currency), 'Chiffre d\'affaires'] : [value, 'Commandes']
                }
                contentStyle={{ borderRadius: 12, border: '1px solid #eef0f4', fontSize: 13 }}
              />
              <Legend
                formatter={(value) => (value === 'revenue' ? 'Chiffre d\'affaires' : 'Commandes')}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="orders"
                stroke="#e4572e"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {!hasData ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Pas encore assez de donnees"
            description="Les graphiques detailles apparaitront des les premieres commandes servies."
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Produits les plus commandes" subtitle="30 derniers jours" />
            <div className="h-80 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.topProducts} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" horizontal={false} />
                  <XAxis type="number" stroke="#94a0b4" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a0b4"
                    fontSize={11}
                    width={110}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'revenue' ? [formatMoney(value, currency), 'CA'] : [value, 'Quantite']
                    }
                    contentStyle={{ borderRadius: 12, border: '1px solid #eef0f4', fontSize: 13 }}
                  />
                  <Bar dataKey="quantity" fill="#e4572e" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Categories populaires" subtitle="Repartition des quantites vendues" />
            <div className="h-80 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.topCategories}
                    dataKey="quantity"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={55}
                    paddingAngle={2}
                  >
                    {charts.topCategories.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} vendus`, name]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #eef0f4', fontSize: 13 }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Performance des serveuses" subtitle="30 derniers jours" />
            <div className="h-72 p-4">
              {charts.serverPerformance.length === 0 ? (
                <EmptyState title="Aucune commande attribuee" description="Attribuez les commandes pour suivre la performance." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.serverPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a0b4" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a0b4" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === 'revenue' ? [formatMoney(value, currency), 'CA'] : [value, 'Commandes']
                      }
                      contentStyle={{ borderRadius: 12, border: '1px solid #eef0f4', fontSize: 13 }}
                    />
                    <Legend formatter={(value) => (value === 'revenue' ? 'Chiffre d\'affaires' : 'Commandes')} />
                    <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
