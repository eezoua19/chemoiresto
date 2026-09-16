import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { productApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { formatMoney, timeAgo } from '../../utils/format';

/**
 * L'espace rupture : tout ce qui est indisponible en ce moment, au même
 * endroit, mis à jour en direct.
 *
 * Une rupture déclarée en salle arrive ici sans recharger - même événement
 * que la cloche et la pastille du menu (AdminLayout, AdminProductsPage) :
 * product_availability. Cet écran est la vue dédiée ; les deux autres ne
 * sont que des rappels qu'elle existe.
 */
export default function AdminRuptureBoardPage() {
  const { restaurant } = useAuth();
  const currency = restaurant?.currency || 'FCFA';
  const toast = useToast();
  const [produits, setProduits] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProduits(await productApi.list({ available: false }));
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Retire ou ajoute a la volee : pas besoin de tout recharger a chaque
  // changement, on connait deja la forme exacte de l'evenement.
  useSocketEvent('product_availability', (changement) => {
    setProduits((current) => {
      if (!current) return current;
      if (changement.isAvailable) {
        return current.filter((produit) => produit.id !== changement.id);
      }
      if (current.some((produit) => produit.id === changement.id)) return current;
      return [{ ...changement, updatedAt: new Date().toISOString() }, ...current];
    });
  });

  const remettreEnStock = async (produit) => {
    setBusy(produit.id);
    try {
      await productApi.toggleAvailability(produit.id);
      toast.success(`${produit.name} est de nouveau disponible`);
      setProduits((current) => current.filter((p) => p.id !== produit.id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  if (produits === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ruptures"
        subtitle={
          produits.length > 0
            ? `${produits.length} plat${produits.length > 1 ? 's' : ''} indisponible${produits.length > 1 ? 's' : ''} en ce moment`
            : 'Rien à signaler'
        }
        icon={AlertTriangle}
        action={
          <Button variant="secondary" icon={RefreshCw} onClick={load}>
            Actualiser
          </Button>
        }
      />

      {produits.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Aucune rupture en cours"
            description="Tout ce qui est au menu aujourd'hui est disponible. Une rupture déclarée en salle apparaît ici instantanément."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {produits.map((produit) => (
            <div
              key={produit.id}
              className="card flex flex-wrap items-center gap-x-4 gap-y-3 border-amber-200 bg-amber-50/40 p-4"
            >
              <div className="min-w-[170px] flex-1">
                <h3 className="font-bold text-ink-900">{produit.name}</h3>
                <p className="text-xs text-ink-500">
                  {produit.category?.name || 'Sans catégorie'}
                  {produit.basePrice !== undefined ? ` · ${formatMoney(produit.basePrice, currency)}` : ''}
                </p>
              </div>

              <div className="min-w-[110px] text-xs font-medium text-amber-700">
                Rupture {timeAgo(produit.updatedAt)}
              </div>

              <Button loading={busy === produit.id} onClick={() => remettreEnStock(produit)}>
                Remettre en stock
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
