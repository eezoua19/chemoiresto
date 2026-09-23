import { Heart, Plus, Star } from 'lucide-react';
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
export default function ProductCard({
  item,
  currency,
  onSelect,
  index = 0,
  favori = false,
  onBasculerFavori,
}) {
  const image = imageUrl(item.image);
  const disabled = !item.isAvailable;
  const retard = Math.min(index, DERNIER_ECHELON) * 45;
  const avecCoeur = Boolean(onBasculerFavori);

  return (
    <div
      style={{ animationDelay: `${retard}ms` }}
      className={`group relative flex w-full animate-entree gap-3 rounded-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-800 p-3 text-left transition
                  ${disabled ? 'opacity-60' : 'active:scale-[0.99] hover:border-brand-200 hover:shadow-card'}`}
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
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
          // Un reflet traverse le badge toutes les quelques secondes. Assez
          // lent pour attirer l'oeil sans le harceler - et la couche qui
          // brille est masquee par le badge lui-meme.
          <span className="absolute left-1 top-1 flex items-center gap-0.5 overflow-hidden rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
            <span
              aria-hidden
              className="absolute inset-y-0 -left-4 w-4 animate-reflet bg-white/70 blur-[2px]"
            />
            <Star size={10} className="relative fill-amber-950" />
            <span className="relative">DU JOUR</span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3
          className={`font-semibold leading-tight text-ink-900 dark:text-ink-50 ${avecCoeur ? 'pr-9' : ''}`}
        >
          {item.name}
        </h3>
        {item.description && (
          <p
            className={`mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400 ${avecCoeur ? 'pr-9' : ''}`}
          >
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <p className="font-bold text-ink-900 dark:text-ink-50">{formatMoney(item.price, currency)}</p>
            {item.hasSpecialPrice && item.basePrice !== item.price && (
              <p className="text-xs text-ink-400 dark:text-ink-500 line-through">
                {formatMoney(item.basePrice, currency)}
              </p>
            )}
          </div>

          {disabled ? (
            <span className="badge bg-red-50 dark:bg-red-900/20 text-red-600">Indisponible</span>
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

      {/* Toute la carte reste cliquable, mais le clic est porte par cette
          couche plutot que par la carte elle-meme : le coeur garde ainsi le
          sien, alors que deux boutons ne peuvent pas s'imbriquer. */}
      <button
        type="button"
        onClick={() => onSelect(item)}
        disabled={disabled}
        aria-label={`Choisir ${item.name}`}
        className="absolute inset-0 rounded-2xl"
      />

      {/* Un plat indisponible reste mis en favori : il reviendra a la carte. */}
      {avecCoeur && (
        <button
          type="button"
          onClick={() => onBasculerFavori(item)}
          aria-pressed={favori}
          aria-label={favori ? `Retirer ${item.name} des favoris` : `Mettre ${item.name} en favori`}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 dark:bg-ink-900/70 text-ink-400 dark:text-ink-500 backdrop-blur transition hover:text-rose-500 active:scale-90"
        >
          <Heart size={15} className={favori ? 'fill-rose-500 text-rose-500' : ''} />
        </button>
      )}
    </div>
  );
}
