import { Plus, Star } from 'lucide-react';
import { imageUrl } from '../../services/api';
import { formatMoney } from '../../utils/format';
import PlatSansPhoto from './PlatSansPhoto';

/** Au-dela, l'attente devient perceptible : tout le reste arrive ensemble. */
const DERNIER_ECHELON = 8;

/**
 * Carte produit du menu client.
 *
 * `index` sert a echelonner l'apparition : la carte se dresse plat par plat
 * au lieu d'apparaitre d'un bloc. Le decalage reste court et plafonne.
 */
export default function ProductCard({ item, currency, onSelect, index = 0 }) {
  const image = imageUrl(item.image);
  const disabled = !item.isAvailable;
  const retard = Math.min(index, DERNIER_ECHELON) * 45;

  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(item)}
      disabled={disabled}
      style={{ animationDelay: `${retard}ms` }}
      className={`group flex w-full animate-entree gap-3 rounded-2xl border border-ink-100 bg-white p-3 text-left transition
                  ${disabled ? 'opacity-60' : 'active:scale-[0.99] hover:border-brand-200 hover:shadow-card'}`}
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100">
        {image ? (
          // Le leger zoom a l'appui donne la sensation que la photo repond au
          // doigt. Uniquement une transformation : rien a recalculer.
          <img
            src={image}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-active:scale-110"
          />
        ) : (
          <PlatSansPhoto taille="sm" />
        )}
        {item.isDishOfDay && (
          <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
            <Star size={10} className="fill-amber-950" /> DU JOUR
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-semibold leading-tight text-ink-900">{item.name}</h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{item.description}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <p className="font-bold text-ink-900">{formatMoney(item.price, currency)}</p>
            {item.hasSpecialPrice && item.basePrice !== item.price && (
              <p className="text-xs text-ink-400 line-through">
                {formatMoney(item.basePrice, currency)}
              </p>
            )}
          </div>

          {disabled ? (
            <span className="badge bg-red-50 text-red-600">Indisponible</span>
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              <Plus size={18} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
