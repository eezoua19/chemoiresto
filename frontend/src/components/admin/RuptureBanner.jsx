import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { productApi } from '../../services/endpoints';
import useSocketEvent from '../../hooks/useSocketEvent';
import { Card, CardHeader } from '../ui';

/**
 * Rappel compact sur le tableau de bord : ce qui est en rupture en ce
 * moment, mis a jour en direct (meme evenement que l'espace Ruptures et la
 * pastille de la barre laterale). Ne s'affiche que s'il y a quelque chose -
 * un tableau de bord qui alerte en permanence finit par n'alerter de rien
 * (meme principe que MiseEnService, juste a cote).
 */
export default function RuptureBanner() {
  const [produits, setProduits] = useState([]);

  const load = useCallback(() => {
    productApi.list({ available: false }).then(setProduits).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent('product_availability', (changement) => {
    setProduits((current) => {
      if (changement.isAvailable) return current.filter((p) => p.id !== changement.id);
      if (current.some((p) => p.id === changement.id)) return current;
      return [changement, ...current];
    });
  });

  if (produits.length === 0) return null;

  return (
    <Card className="mb-5 border-amber-200 bg-amber-50/50">
      <CardHeader
        title="Ruptures en cours"
        subtitle={`${produits.length} plat${produits.length > 1 ? 's' : ''} indisponible${produits.length > 1 ? 's' : ''}`}
        icon={AlertTriangle}
      />
      <div className="flex flex-wrap gap-2 p-4 pt-0">
        {produits.slice(0, 6).map((produit) => (
          <span
            key={produit.id}
            className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800"
          >
            {produit.name}
          </span>
        ))}
        {produits.length > 6 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            +{produits.length - 6}
          </span>
        )}
        <Link
          to="/admin/ruptures"
          className="ml-auto inline-flex items-center gap-0.5 text-sm font-semibold text-amber-800 hover:underline"
        >
          Voir tout <ChevronRight size={15} />
        </Link>
      </div>
    </Card>
  );
}
