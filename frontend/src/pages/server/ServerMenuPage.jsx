import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, UtensilsCrossed, CheckCircle2, XCircle } from 'lucide-react';
import { productApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { Button, EmptyState, ErrorState, Input, NoResults, Skeleton } from '../../components/ui';
import { formatMoney } from '../../utils/format';

/**
 * La carte vue de la salle.
 *
 * Quand le tilapia est fini a 20 h, la serveuse le declare elle-même : sans cet
 * écran il fallait joindre l'administratrice pendant que les clients
 * continuaient a le commander. Un seul geste par plat, et la rupture part
 * aussitot sur les autres appareils du personnel.
 */
export default function ServerMenuPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [rupturesSeules, setRupturesSeules] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts(await productApi.list({ active: 'true' }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Une rupture déclarée sur un autre téléphone doit apparaitre ici sans que
  // personne n'ait a rafraichir.
  useSocketEvent('product_availability', (changement) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === changement.id
          ? { ...product, isAvailable: changement.isAvailable }
          : product
      )
    );
  });

  const basculer = async (product) => {
    setBusy(product.id);
    try {
      const updated = await productApi.toggleAvailability(product.id);
      setProducts((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, isAvailable: updated.isAvailable } : item
        )
      );
      toast.success(
        updated.isAvailable
          ? `${updated.name} est de nouveau disponible`
          : `${updated.name} est signalé en rupture`
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const ruptures = products.filter((product) => !product.isAvailable).length;

  // Regroupement par catégorie, dans l'ordre d'affichage de la carte.
  const groupes = useMemo(() => {
    const terme = search.trim().toLowerCase();
    const filtres = products.filter((product) => {
      if (rupturesSeules && product.isAvailable) return false;
      if (terme && !product.name.toLowerCase().includes(terme)) return false;
      return true;
    });

    const parCategorie = new Map();
    for (const product of filtres) {
      const cle = product.category?.id ?? 'sans';
      if (!parCategorie.has(cle)) {
        parCategorie.set(cle, { nom: product.category?.name || 'Sans catégorie', produits: [] });
      }
      parCategorie.get(cle).produits.push(product);
    }
    return [...parCategorie.values()];
  }, [products, search, rupturesSeules]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">La carte</h1>
          <p className="text-sm text-ink-500">
            {ruptures === 0
              ? 'Tous les plats sont disponibles'
              : `${ruptures} plat${ruptures > 1 ? 's' : ''} en rupture`}
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Actualiser
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Chercher un plat"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button
          variant={rupturesSeules ? 'primary' : 'secondary'}
          onClick={() => setRupturesSeules((value) => !value)}
        >
          {rupturesSeules ? 'Voir toute la carte' : 'Voir les ruptures'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />
      ) : products.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UtensilsCrossed}
            title="Aucun plat sur la carte"
            description="L'administratrice n'a pas encore enregistré de plat."
          />
        </div>
      ) : groupes.length === 0 ? (
        <div className="card">
          <NoResults
            description={
              rupturesSeules
                ? 'Aucun plat en rupture pour le moment.'
                : 'Aucun plat ne correspond à cette recherche.'
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groupes.map((groupe) => (
            <section key={groupe.nom}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">
                {groupe.nom}
              </h2>
              <div className="space-y-2">
                {groupe.produits.map((product) => (
                  <div
                    key={product.id}
                    className={`card flex items-center gap-3 p-3 ${
                      product.isAvailable ? '' : 'border-red-200 bg-red-50/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate font-semibold ${
                          product.isAvailable ? 'text-ink-900' : 'text-ink-500 line-through'
                        }`}
                      >
                        {product.name}
                      </p>
                      <p className="text-xs text-ink-500">{formatMoney(product.basePrice)}</p>
                    </div>

                    {/* Un bouton plein, pas une petite bascule : il se touche
                        d'un pouce, en salle, sans viser. */}
                    <Button
                      variant={product.isAvailable ? 'secondary' : 'primary'}
                      icon={product.isAvailable ? XCircle : CheckCircle2}
                      loading={busy === product.id}
                      onClick={() => basculer(product)}
                      className="shrink-0"
                    >
                      {product.isAvailable ? 'Rupture' : 'Remettre'}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
