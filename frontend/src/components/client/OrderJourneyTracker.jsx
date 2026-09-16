import { BellRing, ChefHat, CookingPot, PartyPopper, Receipt } from 'lucide-react';
import { CLIENT_TIMELINE } from '../../utils/constants';

/**
 * Le suivi de commande, comme un trajet plutôt qu'une liste à cocher.
 *
 * L'inspiration : les applis de VTC, où l'on regarde la voiture avancer sur
 * la carte plutôt que de lire "En route" en texte. Ici pas de carte, mais le
 * même principe - un marqueur qui parcourt un rail jusqu'à la prochaine
 * étape, avec un petit rebond à l'arrivée (`animate-pop`, rejoué à chaque
 * changement via `key`). Cinq étapes fixes suffisent : pas besoin de GPS
 * quand le trajet est toujours le même, de la cuisine à la table.
 */
const ETAPES = [
  { status: 'NEW', icon: Receipt, label: 'Reçue', recit: 'Votre commande est arrivée en cuisine.' },
  { status: 'ACCEPTED', icon: ChefHat, label: 'Acceptée', recit: 'Le chef a accepté votre commande.' },
  { status: 'PREPARING', icon: CookingPot, label: 'Préparation', recit: 'Ça chauffe en cuisine !' },
  { status: 'READY', icon: BellRing, label: 'Prête', recit: 'Votre plat vous attend.' },
  { status: 'SERVED', icon: PartyPopper, label: 'Servie', recit: 'Bon appétit !' },
];

export default function OrderJourneyTracker({ order }) {
  if (order.status === 'CANCELLED') {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Cette commande a été annulée. Adressez-vous à une serveuse.
      </div>
    );
  }

  const currentIndex = Math.max(0, CLIENT_TIMELINE.indexOf(order.status));
  const pourcentage = (currentIndex / (ETAPES.length - 1)) * 100;
  const etape = ETAPES[currentIndex];
  const Icone = etape.icon;

  return (
    <div>
      <div className="relative mx-2 pt-6 pb-1">
        {/* Le rail : parcouru en degrade, a venir en gris. */}
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-700 ease-out"
          style={{ width: `${pourcentage}%` }}
        />

        {/* Les cinq stations, posees sur le rail. */}
        <div className="relative flex justify-between">
          {ETAPES.map((item, index) => (
            <span
              key={item.status}
              className={`z-10 h-3 w-3 rounded-full border-2 transition-colors duration-500 ${
                index <= currentIndex ? 'border-brand-600 bg-brand-600' : 'border-ink-200 bg-white'
              }`}
            />
          ))}
        </div>

        {/* Le marqueur mobile : glisse jusqu'a la station courante et y rebondit. */}
        <div
          key={currentIndex}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pop transition-[left] duration-700"
          style={{ left: `${pourcentage}%`, transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <div className="relative flex h-11 w-11 animate-flotte items-center justify-center rounded-full bg-white text-brand-600 shadow-float ring-4 ring-brand-100">
            <Icone size={20} strokeWidth={2.2} />
            {order.status === 'PREPARING' && (
              <span
                aria-hidden
                className="absolute -top-2.5 left-1/2 h-3 w-0.5 -translate-x-1/2 animate-vapeur rounded-full bg-brand-300"
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex justify-between px-0.5">
        {ETAPES.map((item, index) => (
          <span
            key={item.status}
            className={`w-9 text-center text-[10px] font-medium leading-tight ${
              index === currentIndex
                ? 'font-bold text-brand-600'
                : index < currentIndex
                  ? 'text-ink-500'
                  : 'text-ink-300'
            }`}
          >
            {item.label}
          </span>
        ))}
      </div>

      <p key={`recit-${currentIndex}`} className="mt-3 animate-fade-in text-center text-sm text-ink-600">
        {etape.recit}
      </p>
    </div>
  );
}
