import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { formatTime } from '../../utils/format';
import useNotificationSound from '../../hooks/useNotificationSound';

/**
 * Le temps d'attente annoncé, vu par le client.
 *
 * Un client qui sait qu'il attend vingt minutes patiente. Un client qui ne
 * sait rien s'énerve au bout de douze.
 *
 * Le compte à rebours part de l'heure d'arrivée prévue, enregistrée par le
 * serveur au moment où la serveuse a annoncé. Recalculer à partir de la durée
 * afficherait « 20 minutes » à chaque rechargement de page, indéfiniment.
 *
 * Et quand l'heure est dépassée, on ne montre pas un nombre négatif : on dit
 * « d'un instant à l'autre ». Personne n'a envie de lire qu'il attend depuis
 * sept minutes de trop.
 */
export default function TempsDAttente({ order, compact = false }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const prevu = order?.estimatedReadyAt ? new Date(order.estimatedReadyAt).getTime() : null;
  const pertinent =
    prevu && !['READY', 'SERVED', 'CANCELLED'].includes(order.status);
  const minutes = prevu ? Math.round((prevu - maintenant) / 60000) : null;
  const depasse = pertinent && minutes <= 0;

  useEffect(() => {
    if (!pertinent) return undefined;
    // Toutes les quinze secondes : la minute affichée est juste, et le
    // téléphone ne se réveille pas pour rien.
    const minuteur = setInterval(() => setMaintenant(Date.now()), 15000);
    return () => clearInterval(minuteur);
  }, [pertinent]);

  // Un signal au moment precis ou le delai annonce s'ecoule - pas a chaque
  // tick des quinze secondes qui suivent, sinon la seconde alerte ressemble
  // a la premiere et perd tout son sens.
  // Initialise avec la valeur du tout premier rendu : rouvrir la page d'une
  // commande deja en depassement ne doit pas sonner comme si l'instant
  // venait d'arriver.
  const playSound = useNotificationSound();
  const depasseAvant = useRef(depasse);
  useEffect(() => {
    if (depasse && !depasseAvant.current) playSound();
    depasseAvant.current = depasse;
  }, [depasse, playSound]);

  if (!pertinent) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
        <Timer size={12} />
        {depasse ? "d'un instant à l'autre" : `~${minutes} min`}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-3">
      <span className="shrink-0 rounded-xl bg-white/70 p-2 text-brand-700">
        <Timer size={20} />
      </span>

      <div className="min-w-0">
        {depasse ? (
          <>
            <p className="font-bold leading-tight text-brand-900">
              Votre plat arrive d&apos;un instant à l&apos;autre
            </p>
            <p className="text-xs text-brand-900/70">
              Annoncé pour {formatTime(order.estimatedReadyAt)}
            </p>
          </>
        ) : (
          <>
            <p className="font-bold leading-tight text-brand-900">
              Prêt dans environ {minutes} minute{minutes > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-brand-900/70">
              Vers {formatTime(order.estimatedReadyAt)} — annoncé par la serveuse
            </p>
          </>
        )}
      </div>
    </div>
  );
}
