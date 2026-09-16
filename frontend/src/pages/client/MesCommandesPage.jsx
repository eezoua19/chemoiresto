import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ReceiptText } from 'lucide-react';
import { publicApi } from '../../services/endpoints';
import { listerCommandes, retirerCommande } from '../../utils/orderHistory';
import { EmptyState, Footer } from '../../components/ui';
import { formatDateTime, formatMoney } from '../../utils/format';
import { ORDER_STATUS } from '../../utils/constants';

/**
 * L'historique des commandes de ce téléphone, tous restaurants confondus.
 *
 * Pas de compte client : la liste vient du local storage (voir
 * utils/orderHistory), pas du serveur. Chaque entrée est ensuite
 * rafraîchie via le suivi public (jeton non devinable, déjà utilisé sur la
 * page de suivi) pour afficher le statut réel plutôt qu'un instantané figé
 * au moment de la commande.
 */
export default function MesCommandesPage() {
  const [etat, setEtat] = useState({ chargement: true, commandes: [] });

  useEffect(() => {
    let annule = false;

    (async () => {
      const enregistrees = listerCommandes();
      if (!enregistrees.length) {
        setEtat({ chargement: false, commandes: [] });
        return;
      }

      const resultats = await Promise.all(
        enregistrees.map(async (commande) => {
          try {
            const fraiche = await publicApi.trackOrder(commande.trackingToken);
            return { ...commande, status: fraiche.status, total: fraiche.total };
          } catch (error) {
            if (error.status === 404) retirerCommande(commande.trackingToken);
            // Hors-ligne ou erreur passagere : on garde l'instantané local
            // plutot que de faire disparaitre la commande de la liste.
            return error.status === 404 ? null : commande;
          }
        })
      );

      if (!annule) setEtat({ chargement: false, commandes: resultats.filter(Boolean) });
    })();

    return () => {
      annule = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-ink-50 pb-10">
      <header
        className="px-5 pb-6 pt-6 text-white"
        style={{ background: 'linear-gradient(160deg, var(--brand) 0%, var(--brand-dark) 100%)' }}
      >
        <div className="mx-auto max-w-lg">
          <Link
            to="/"
            onClick={(event) => {
              event.preventDefault();
              window.history.length > 1 ? window.history.back() : (window.location.href = '/');
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white"
          >
            <ArrowLeft size={16} /> Retour
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold">Mes commandes</h1>
          <p className="mt-1 text-sm text-white/85">L'historique de ce téléphone</p>
        </div>
      </header>

      <div className="mx-auto -mt-4 max-w-lg space-y-3 px-4">
        {etat.chargement && (
          <div className="card animate-entree space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-ink-100" />
            ))}
          </div>
        )}

        {!etat.chargement && etat.commandes.length === 0 && (
          <div className="card animate-entree p-6">
            <EmptyState
              icon={ReceiptText}
              title="Aucune commande pour l'instant"
              description="Les commandes que vous passez depuis ce téléphone apparaîtront ici."
            />
          </div>
        )}

        {etat.commandes.map((commande, index) => {
          const config = ORDER_STATUS[commande.status] || ORDER_STATUS.NEW;
          return (
            <Link
              key={commande.trackingToken}
              to={`/commande/${commande.trackingToken}`}
              className="card animate-entree block p-4"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {commande.restaurantName}
                  </p>
                  <p className="font-bold text-ink-900">{commande.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {commande.tableLabel || 'À emporter'} · {formatDateTime(commande.createdAt)}
                  </p>
                </div>
                <span className={`badge shrink-0 ${config.badge}`}>{config.clientLabel}</span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900">
                  {formatMoney(commande.total, commande.currency)}
                </span>
                <span
                  className="inline-flex items-center gap-0.5 text-sm font-semibold"
                  style={{ color: 'var(--brand)' }}
                >
                  Voir <ChevronRight size={15} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <Footer />
    </div>
  );
}
