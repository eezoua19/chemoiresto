import { useCallback, useEffect, useState } from 'react';
import {
  ScrollText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  UserX,
} from 'lucide-react';
import { auditApi } from '../../services/endpoints';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { formatDateTime } from '../../utils/format';
import { LIBELLES_ACTION, tonDeLAction } from '../../utils/journal';

const FILTRES_VIDES = { q: '', action: '', entity: '', from: '', to: '' };

/**
 * Journal des actions de gestion : qui a fait quoi, quand.
 *
 * Lecture seule, sans exception. Un journal que l'on peut corriger ne prouve
 * plus rien — il n'y a donc ici ni bouton « supprimer » ni bouton « modifier »,
 * pas même pour l'administrateur qui consulte la page.
 */
export default function AdminJournalPage() {
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState(null);
  const [choix, setChoix] = useState({ actions: [], entities: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { page, pageSize: 50 };
      Object.entries(filtres).forEach(([cle, valeur]) => {
        if (valeur) params[cle] = valeur;
      });
      setResultat(await auditApi.list(params));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filtres, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Les filtres proposés sont ceux qui existent vraiment dans le journal :
  // inutile d'offrir « Table supprimée » si aucune table ne l'a jamais été.
  useEffect(() => {
    auditApi.filters().then(setChoix).catch(() => {});
  }, []);

  const changer = (champ, valeur) => {
    setPage(1);
    setFiltres((actuels) => ({ ...actuels, [champ]: valeur }));
  };

  const entrees = resultat?.entries || [];
  const pagination = resultat?.pagination;
  const filtreActif = Object.values(filtres).some(Boolean);

  return (
    <div>
      <PageHeader
        title="Journal des actions"
        subtitle="Qui a fait quoi, et quand. Consultation seule."
        icon={ScrollText}
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input
              className="pl-9"
              placeholder="Rechercher un plat, un nom..."
              value={filtres.q}
              onChange={(event) => changer('q', event.target.value)}
            />
          </div>

          <Select value={filtres.action} onChange={(event) => changer('action', event.target.value)}>
            <option value="">Toutes les actions</option>
            {choix.actions.map((action) => (
              <option key={action.value} value={action.value}>
                {LIBELLES_ACTION[action.value] || action.value} ({action.count})
              </option>
            ))}
          </Select>

          <Input
            type="date"
            value={filtres.from}
            onChange={(event) => changer('from', event.target.value)}
            aria-label="À partir du"
          />
          <Input
            type="date"
            value={filtres.to}
            onChange={(event) => changer('to', event.target.value)}
            aria-label="Jusqu'au"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={load}>
            Actualiser
          </Button>
          {filtreActif && (
            <Button
              variant="ghost"
              onClick={() => {
                setFiltres(FILTRES_VIDES);
                setPage(1);
              }}
            >
              Effacer les filtres
            </Button>
          )}
          {pagination && (
            <span className="ml-auto text-sm text-ink-500">
              {pagination.total} action{pagination.total > 1 ? 's' : ''} enregistrée
              {pagination.total > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : entrees.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title={filtreActif ? 'Aucune action ne correspond' : 'Le journal est vide'}
            description={
              filtreActif
                ? 'Essayez une autre période ou un autre type d’action.'
                : "Les créations, modifications et suppressions apparaîtront ici au fur et à mesure."
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-ink-100 p-0">
          {entrees.map((entree, index) => {
            const ton = tonDeLAction(entree.action);
            return (
              <div
                key={entree.id}
                className="animate-entree flex flex-wrap items-start gap-3 p-4"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${ton.point}`} />

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{entree.label}</p>

                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                    <span className={`badge ${ton.badge}`}>
                      {LIBELLES_ACTION[entree.action] || entree.action}
                    </span>
                    <span>
                      par <span className="font-semibold text-ink-700">{entree.author.fullName}</span>
                      {entree.author.role === 'ADMIN' ? ' (administration)' : ''}
                    </span>
                    {!entree.author.stillExists && (
                      <span
                        className="inline-flex items-center gap-1 text-ink-400"
                        title="Ce compte a été supprimé depuis"
                      >
                        <UserX size={12} /> compte supprimé
                      </span>
                    )}
                  </p>

                  {entree.details?.ancienPrix !== undefined && (
                    <p className="mt-1 text-xs text-ink-600">
                      Ancien prix {entree.details.ancienPrix} FCFA, nouveau{' '}
                      {entree.details.nouveauPrix} FCFA
                    </p>
                  )}
                  {entree.details?.passages > 0 && (
                    <p className="mt-1 text-xs text-ink-600">
                      {entree.details.passages} passage{entree.details.passages > 1 ? 's' : ''}{' '}
                      effacé{entree.details.passages > 1 ? 's' : ''} avec l&apos;abonnement
                    </p>
                  )}
                </div>

                <time className="shrink-0 text-xs text-ink-400" dateTime={entree.createdAt}>
                  {formatDateTime(entree.createdAt)}
                </time>
              </div>
            );
          })}

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
              <span className="px-3 text-sm text-ink-600">
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
    </div>
  );
}
