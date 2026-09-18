import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, CircleDot } from 'lucide-react';
import { menuApi } from '../../services/endpoints';
import { ErrorState, PageHeader, Skeleton, Button, Card } from '../../components/ui';
import { MONTHS, WEEKDAYS } from '../../utils/constants';
import { toDateString, todayString } from '../../utils/format';

/**
 * Calendrier mensuel des menus.
 * Pastille verte = menu configure, pastille rouge = aucun menu.
 */
export default function AdminMenuCalendarPage() {
  const navigate = useNavigate();
  const now = new Date();

  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const monthParam = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await menuApi.list({ month: monthParam });
      setMenus(result.menus);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [monthParam]);

  useEffect(() => {
    load();
  }, [load]);

  const menuByDate = useMemo(
    () => new Map(menus.map((menu) => [menu.date, menu])),
    [menus]
  );

  /** Grille du mois, commencant un lundi. */
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // lundi = 0

    const result = [];
    for (let i = 0; i < offset; i += 1) result.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      result.push(new Date(cursor.year, cursor.month, day));
    }
    return result;
  }, [cursor]);

  const shiftMonth = (delta) => {
    setCursor((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  const today = todayString();
  const configured = menus.filter((menu) => menu.itemCount > 0).length;

  return (
    <div>
      <PageHeader
        title="Calendrier des menus"
        subtitle="Programmez le menu de chaque journée, plusieurs jours à l'avance"
        icon={CalendarDays}
        action={
          <Button icon={Plus} onClick={() => navigate(`/admin/menus/${today}`)}>
            Menu d&apos;aujourd&apos;hui
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 dark:border-ink-700 px-5 py-4">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-xl p-2 text-ink-600 dark:text-ink-300 transition hover:bg-ink-100 dark:hover:bg-ink-700"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
              {MONTHS[cursor.month]} {cursor.year}
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {configured} menu{configured > 1 ? 's' : ''} programme{configured > 1 ? 's' : ''} ce mois
            </p>
          </div>

          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-xl p-2 text-ink-600 dark:text-ink-300 transition hover:bg-ink-100 dark:hover:bg-ink-700"
            aria-label="Mois suivant"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
        ) : (
          <div className="p-3 sm:p-5">
            <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-1 text-center text-xs font-bold uppercase text-ink-400 dark:text-ink-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {cells.map((date, index) => {
                if (!date) return <div key={`empty-${index}`} />;

                const dateString = toDateString(date);
                const menu = menuByDate.get(dateString);
                const hasMenu = Boolean(menu && menu.itemCount > 0);
                const isToday = dateString === today;
                const isPast = dateString < today;

                return (
                  <button
                    key={dateString}
                    type="button"
                    onClick={() => navigate(`/admin/menus/${dateString}`)}
                    className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border p-1 transition
                      ${isToday ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30' : 'border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 hover:border-brand-200 hover:bg-ink-50 dark:hover:bg-ink-800'}
                      ${isPast && !hasMenu ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`text-sm font-bold ${isToday ? 'text-brand-700' : 'text-ink-800 dark:text-ink-100'}`}
                    >
                      {date.getDate()}
                    </span>

                    <span
                      className={`h-2 w-2 rounded-full ${hasMenu ? 'bg-emerald-500' : 'bg-red-400'}`}
                      title={hasMenu ? 'Menu configure' : 'Aucun menu'}
                    />

                    {hasMenu && (
                      <span className="hidden text-[10px] font-medium text-ink-500 dark:text-ink-400 sm:block">
                        {menu.itemCount} plats
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="mt-4 grid grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((index) => (
                  <Skeleton key={index} className="h-3" />
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-5 border-t border-ink-100 dark:border-ink-700 pt-4 text-sm text-ink-600 dark:text-ink-300">
              <span className="inline-flex items-center gap-2">
                <CircleDot size={14} className="text-emerald-500" /> Menu configure
              </span>
              <span className="inline-flex items-center gap-2">
                <CircleDot size={14} className="text-red-400" /> Aucun menu
              </span>
              <span className="text-ink-400 dark:text-ink-500">
                Cliquez sur une date pour créer ou modifier son menu.
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
