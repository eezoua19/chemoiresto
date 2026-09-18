import { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ShoppingBag,
  Clock,
  Printer,
  Download,
} from 'lucide-react';
import { closingApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { formatMoney, formatLongDate } from '../../utils/format';
import { printClosing } from '../../components/closings/printClosing';
import { telechargerFichier } from '../../utils/download';

/** Premier jour du mois en cours, au format AAAA-MM-JJ. */
function debutMoisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Date du jour, au format AAAA-MM-JJ. */
function dateDuJour() {
  return new Date().toISOString().slice(0, 10);
}

/** "12 h" plutôt que "12" : une heure de pointe se lit comme une heure. */
const heure = (valeur) => (valeur === null || valeur === undefined ? null : `${valeur} h`);

/**
 * Ce que le restaurant a fait, jour par jour.
 *
 * Chaque nuit à 3 h, la veille est arrêtée et ses chiffres figés. La journée en
 * cours, elle, n'est jamais figée : elle est recalculée à chaque affichage et
 * annoncée comme telle, sinon on lirait une recette « définitive » à 11 h du
 * matin.
 */
export default function AdminClosingsPage() {
  const { restaurant } = useAuth();
  const toast = useToast();
  const devise = restaurant?.currency || 'FCFA';

  const [page, setPage] = useState(1);
  const [avecVides, setAvecVides] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [aujourdhui, setAujourdhui] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [exportFrom, setExportFrom] = useState(debutMoisCourant);
  const [exportTo, setExportTo] = useState(dateDuJour);
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [liste, jour] = await Promise.all([
        closingApi.list({ page, pageSize: 31, includeEmpty: avecVides }),
        closingApi.today(),
      ]);
      setResultat(liste);
      setAujourdhui(jour);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, avecVides]);

  useEffect(() => {
    load();
  }, [load]);

  const ouvrir = async (date) => {
    setBusy(true);
    try {
      setDetail(await closingApi.detail(date));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const recalculer = async (date) => {
    setBusy(true);
    try {
      const mis = await closingApi.close(date);
      toast.success('Journée recalculée');
      setDetail(mis);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exporterPDF = async () => {
    setExportBusy(true);
    try {
      const fichier = await closingApi.exportPdf({ from: exportFrom, to: exportTo });
      telechargerFichier(fichier, `export-comptable-${exportFrom}-au-${exportTo}.pdf`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExportBusy(false);
    }
  };

  const journees = resultat?.closings || [];
  const vides = resultat?.emptyDays || 0;
  const totaux = resultat?.totals;
  const pagination = resultat?.pagination;

  return (
    <div>
      <PageHeader
        title="Clôtures de journée"
        subtitle="Ce que chaque journée a donné. Arrêté automatiquement chaque nuit."
        icon={CalendarCheck}
      />

      {/* ------------------------- La journée en cours ------------------------ */}
      {aujourdhui && (
        <Card className="mb-5 border-brand-200 bg-brand-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-brand-900">Aujourd&apos;hui, en cours</p>
              <p className="text-xs text-brand-900/70">
                Ces chiffres bougent encore. Ils seront arrêtés cette nuit à 3 h.
              </p>
            </div>
            <Button variant="secondary" icon={RefreshCw} onClick={load}>
              Actualiser
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Recette"
              value={formatMoney(aujourdhui.revenue, devise)}
              tone="brand"
            />
            <StatCard label="Commandes" value={aujourdhui.ordersCount} tone="emerald" />
            <StatCard
              label="Panier moyen"
              value={formatMoney(aujourdhui.averageTicket, devise)}
              tone="ink"
            />
            <StatCard label="Abonnés" value={aujourdhui.subscriptionUsages} tone="ink" />
          </div>
        </Card>
      )}

      {/* ----------------------------- Le cumul ----------------------------- */}
      {totaux && totaux.days > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label={`Recette / ${totaux.days} j`}
            value={formatMoney(totaux.revenue, devise)}
            tone="brand"
          />
          <StatCard label="Commandes" value={totaux.orders} tone="emerald" />
          <StatCard
            label="Moyenne / jour"
            value={formatMoney(Math.round(totaux.revenue / totaux.days), devise)}
            tone="ink"
          />
        </div>
      )}

      {/* ------------------------- Export comptable ------------------------- */}
      <Card className="mb-5 p-4">
        <p className="text-sm font-bold text-ink-900 dark:text-ink-50">Export comptable</p>
        <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">
          Un récapitulatif PDF de la période, prêt à envoyer au comptable.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Du</label>
            <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Au</label>
            <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
          </div>
          <Button
            icon={Download}
            onClick={exporterPDF}
            loading={exportBusy}
            disabled={!exportFrom || !exportTo}
          >
            Télécharger le PDF
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : journees.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title={vides > 0 ? 'Aucune journée avec service' : 'Aucune journée clôturée'}
            description={
              vides > 0
                ? `${vides} journée${vides > 1 ? 's ont' : ' a'} été clôturée${
                    vides > 1 ? 's' : ''
                  } sans la moindre commande.`
                : "La première clôture aura lieu cette nuit à 3 h. Vous retrouverez ici la recette de chaque journée."
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-ink-100 dark:divide-ink-700 p-0">
          {journees.map((journee) => (
            <button
              key={journee.date}
              type="button"
              onClick={() => ouvrir(journee.date)}
              className="flex w-full flex-wrap items-center gap-3 p-4 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-900 dark:text-ink-50">{formatLongDate(journee.date)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
                  <span className="inline-flex items-center gap-1">
                    <ShoppingBag size={12} /> {journee.ordersCount} commande
                    {journee.ordersCount > 1 ? 's' : ''}
                  </span>
                  {journee.cancelledCount > 0 && (
                    <span className="text-red-600">
                      {journee.cancelledCount} annulée{journee.cancelledCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {journee.peakHour !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> pointe à {heure(journee.peakHour)}
                    </span>
                  )}
                </p>
              </div>

              <p className="text-right text-lg font-bold text-ink-900 dark:text-ink-50">
                {formatMoney(journee.revenue, devise)}
              </p>
            </button>
          ))}

          {pagination?.pages > 1 && (
            <div className="flex items-center justify-center gap-2 p-4">
              <Button
                variant="secondary"
                icon={ChevronLeft}
                disabled={page <= 1}
                onClick={() => setPage((valeur) => valeur - 1)}
              >
                Précédent
              </Button>
              <span className="px-3 text-sm text-ink-600 dark:text-ink-300">
                Page {pagination.page} sur {pagination.pages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pagination.pages}
                onClick={() => setPage((valeur) => valeur + 1)}
              >
                Suivant <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Les journées fermées existent bien : on dit qu'elles sont masquées. */}
      {vides > 0 && !loading && !error && (
        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setAvecVides((valeur) => !valeur);
            }}
            className="text-xs font-semibold text-ink-500 dark:text-ink-400 underline-offset-2 hover:text-ink-800 hover:underline"
          >
            {avecVides
              ? 'Masquer les journées sans service'
              : `Afficher aussi les ${vides} journée${vides > 1 ? 's' : ''} sans service`}
          </button>
        </p>
      )}

      {/* ------------------------- Le détail d'un jour ------------------------ */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? formatLongDate(detail.date) : ''}
        footer={
          detail && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => recalculer(detail.date)} loading={busy}>
                Recalculer
              </Button>
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => printClosing(detail, restaurant)}
              >
                Imprimer
              </Button>
              <Button onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            {!detail.closed && (
              <p className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
                Journée non encore arrêtée : ces chiffres peuvent encore bouger.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Recette"
                value={formatMoney(detail.revenue, devise)}
                tone="brand"
                icon={TrendingUp}
              />
              <StatCard label="Commandes" value={detail.ordersCount} tone="emerald" />
              <StatCard
                label="Panier moyen"
                value={formatMoney(detail.averageTicket, devise)}
                tone="ink"
              />
              <StatCard label="Annulées" value={detail.cancelledCount} tone="ink" />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-ink-50 dark:bg-ink-900 p-4 text-sm">
              <dt className="text-ink-500 dark:text-ink-400">En salle</dt>
              <dd className="text-right font-semibold text-ink-900 dark:text-ink-50">
                {formatMoney(detail.dineInRevenue, devise)}
              </dd>
              <dt className="text-ink-500 dark:text-ink-400">À emporter</dt>
              <dd className="text-right font-semibold text-ink-900 dark:text-ink-50">
                {formatMoney(detail.takeawayRevenue, devise)}
              </dd>
              <dt className="text-ink-500 dark:text-ink-400">Passages d&apos;abonnés</dt>
              <dd className="text-right font-semibold text-ink-900 dark:text-ink-50">{detail.subscriptionUsages}</dd>
              <dt className="text-ink-500 dark:text-ink-400">Appels et additions</dt>
              <dd className="text-right font-semibold text-ink-900 dark:text-ink-50">{detail.serviceRequests}</dd>
              {detail.peakHour !== null && (
                <>
                  <dt className="text-ink-500 dark:text-ink-400">Heure de pointe</dt>
                  <dd className="text-right font-semibold text-ink-900 dark:text-ink-50">
                    {heure(detail.peakHour)}
                  </dd>
                </>
              )}
            </dl>

            {detail.topProducts?.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-ink-900 dark:text-ink-50">Les plats les plus vendus</h3>
                <ul className="divide-y divide-ink-100 dark:divide-ink-700 rounded-xl border border-ink-100 dark:border-ink-700">
                  {detail.topProducts.map((plat) => (
                    <li key={plat.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-ink-800 dark:text-ink-100">{plat.name}</span>
                      <span className="text-ink-500 dark:text-ink-400">x{plat.quantity}</span>
                      <span className="font-semibold text-ink-900 dark:text-ink-50">
                        {formatMoney(plat.revenue, devise)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.servers?.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-ink-900 dark:text-ink-50">Le service</h3>
                <ul className="divide-y divide-ink-100 dark:divide-ink-700 rounded-xl border border-ink-100 dark:border-ink-700">
                  {detail.servers.map((personne) => (
                    <li key={personne.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-ink-800 dark:text-ink-100">{personne.name}</span>
                      <span className="text-ink-500 dark:text-ink-400">
                        {personne.orders} commande{personne.orders > 1 ? 's' : ''}
                      </span>
                      <span className="font-semibold text-ink-900 dark:text-ink-50">
                        {formatMoney(personne.revenue, devise)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
