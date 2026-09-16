import { Gift, Sparkles } from 'lucide-react';

/**
 * Progression fidélité affichée une fois la commande servie.
 * `loyalty` vient du suivi de commande : { points, rewardsAvailable, threshold, rewardLabel }.
 */
export default function LoyaltyCard({ loyalty }) {
  if (!loyalty) return null;

  const { points, rewardsAvailable, threshold, rewardLabel } = loyalty;
  const dansLeCycle = threshold ? points % threshold : 0;
  const progres = threshold ? Math.round((dansLeCycle / threshold) * 100) : 0;
  const restantes = threshold ? threshold - dansLeCycle : 0;

  return (
    <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4">
      {rewardsAvailable > 0 ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <Gift size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-ink-900">
              {rewardLabel || 'Récompense'} disponible{rewardsAvailable > 1 ? ` ×${rewardsAvailable}` : ''} !
            </p>
            <p className="text-xs text-ink-500">Montrez cet écran au personnel pour en profiter.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Programme fidélité</p>
            <p className="text-xs text-ink-500">
              Encore {restantes} commande{restantes > 1 ? 's' : ''} pour {rewardLabel || 'une récompense'}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progres}%` }} />
            </div>
          </div>
        </div>
      )}
      <p className="mt-2 text-right text-[11px] text-ink-400">{points} point{points > 1 ? 's' : ''} au total</p>
    </div>
  );
}
