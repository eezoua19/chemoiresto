import { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, Download, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { backupApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { formatDateTime } from '../../utils/format';
import { telechargerFichier } from '../../utils/download';

/** 1 048 576 octets se lit mal : on affiche des Ko ou des Mo. */
function taille(octets) {
  if (!octets) return '0 Ko';
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

/** D'ou vient une sauvegarde, dit en francais. */
const ORIGINES = {
  MANUEL: 'lancée à la main',
  AVANT_RAZ: 'avant une remise à zéro',
  AUTOMATIQUE: 'automatique',
};
const origine = (declencheur) => ORIGINES[declencheur] || 'automatique';

function nomDeFichier(date) {
  const horodatage = new Date(date).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `chemoiresto-${horodatage}.json`;
}

/**
 * Sauvegardes du restaurant.
 *
 * Une sauvegarde est prise automatiquement chaque nuit à 3 h et conservée avec
 * les treize précédentes. Cela protège de l'erreur humaine — une carte vidée,
 * un menu écrasé.
 *
 * Cela ne protège pas de la perte de la base elle-même, puisque les instantanés
 * y vivent. C'est pourquoi le téléchargement est mis en avant ici : la seule
 * copie qui survivrait à tout est celle qui dort ailleurs.
 */
export default function AdminBackupsPage() {
  const toast = useToast();
  const [donnees, setDonnees] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDonnees(await backupApi.list());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sauvegarderMaintenant = async () => {
    setBusy('run');
    try {
      await backupApi.run();
      toast.success('Sauvegarde effectuée');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const telecharger = async (sauvegarde) => {
    setBusy(sauvegarde.id);
    try {
      const fichier = await backupApi.download(sauvegarde.id);
      telechargerFichier(fichier, nomDeFichier(sauvegarde.createdAt));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const sauvegardes = donnees?.snapshots || [];
  const derniere = donnees?.last;
  const heures = donnees?.hoursSinceLast;
  // Plus de 30 h sans sauvegarde : quelque chose ne tourne plus.
  const alerte = derniere === null || (heures !== null && heures > 30);

  return (
    <div>
      <PageHeader
        title="Sauvegardes"
        subtitle="Une copie complète est prise chaque nuit à 3 h"
        icon={DatabaseBackup}
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : (
        <>
          {/* ------------------------- L'état du système ------------------------ */}
          <Card
            className={`mb-5 p-4 ${alerte ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <span
                  className={`mt-0.5 rounded-xl p-2 ${alerte ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
                >
                  {alerte ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
                </span>
                <div>
                  <p
                    className={`text-sm font-bold ${alerte ? 'text-red-900' : 'text-emerald-900'}`}
                  >
                    {derniere
                      ? alerte
                        ? 'Aucune sauvegarde récente'
                        : 'Vos données sont sauvegardées'
                      : 'Aucune sauvegarde pour l’instant'}
                  </p>
                  <p className={`text-xs ${alerte ? 'text-red-900/80' : 'text-emerald-900/80'}`}>
                    {derniere
                      ? `Dernière : ${formatDateTime(derniere.createdAt)} (${taille(
                          derniere.sizeBytes
                        )}, ${origine(derniere.trigger)})`
                      : 'La première sauvegarde automatique aura lieu cette nuit à 3 h.'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" icon={RefreshCw} onClick={load}>
                  Actualiser
                </Button>
                <Button icon={DatabaseBackup} onClick={sauvegarderMaintenant} loading={busy === 'run'}>
                  Sauvegarder maintenant
                </Button>
              </div>
            </div>
          </Card>

          {/* -------------------------- La mise en garde ------------------------- */}
          <Card className="mb-5 border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm font-bold text-amber-900">Gardez-en une chez vous</p>
            <p className="mt-1 text-xs text-amber-900/80">
              Ces sauvegardes vivent sur le même serveur que vos données : elles vous protègent
              d&apos;une suppression malencontreuse, pas d&apos;une panne de l&apos;hébergeur.
              Téléchargez-en une de temps en temps et rangez-la dans un dossier synchronisé
              (OneDrive, Drive) ou sur une clé USB.
            </p>
          </Card>

          {donnees?.kept && (
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard label="Conservées" value={sauvegardes.length} tone="brand" />
              <StatCard label="Maximum" value={donnees.kept} tone="ink" />
              {derniere?.counts && (
                <StatCard
                  label="Commandes"
                  value={derniere.counts.orders ?? 0}
                  tone="emerald"
                />
              )}
            </div>
          )}

          {sauvegardes.length === 0 ? (
            <Card>
              <EmptyState
                icon={DatabaseBackup}
                title="Aucune sauvegarde"
                description="Lancez-en une maintenant, ou attendez la sauvegarde automatique de cette nuit."
              />
            </Card>
          ) : (
            <Card className="divide-y divide-ink-100 p-0">
              {sauvegardes.map((sauvegarde) => (
                <div key={sauvegarde.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">
                      {formatDateTime(sauvegarde.createdAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {taille(sauvegarde.sizeBytes)}
                      {` - ${origine(sauvegarde.trigger)}`}
                      {sauvegarde.counts &&
                        ` - ${sauvegarde.counts.products || 0} plats, ${
                          sauvegarde.counts.orders || 0
                        } commandes`}
                    </p>
                    {sauvegarde.note && (
                      <p className="mt-1 text-xs text-amber-700">{sauvegarde.note}</p>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    icon={Download}
                    disabled={!sauvegarde.downloadable}
                    loading={busy === sauvegarde.id}
                    onClick={() => telecharger(sauvegarde)}
                  >
                    Télécharger
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
