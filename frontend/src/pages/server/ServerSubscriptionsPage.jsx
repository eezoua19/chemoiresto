import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ScanLine, BadgeCheck, ChevronRight } from 'lucide-react';
import { subscriptionApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { Button, EmptyState, Input, NoResults } from '../../components/ui';
import { formatShortDate } from '../../utils/format';
import { echeance, etatDe } from '../../utils/subscription';

/**
 * Le comptoir.
 *
 * Le geste normal, c'est de viser le QR Code du ticket avec l'appareil photo :
 * il ouvre directement l'écran de vérification. Cette page est le filet de
 * sécurité pour un ticket déchiré, un code illisible, ou un client qui a oublié
 * son papier : on retrouve l'abonné par son nom, son téléphone ou son numéro.
 */
export default function ServerSubscriptionsPage() {
  const toast = useToast();
  const [terme, setTerme] = useState('');
  const [resultats, setResultats] = useState(null);
  const [chargement, setChargement] = useState(false);

  const chercher = async (event) => {
    event.preventDefault();
    const q = terme.trim();
    if (q.length < 2) {
      toast.error('Saisissez au moins 2 caractères');
      return;
    }
    setChargement(true);
    try {
      const data = await subscriptionApi.lookup(q);
      setResultats(data.results);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setChargement(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Abonnements</h1>
        <p className="text-sm text-ink-500">Vérifier un ticket et enregistrer un passage</p>
      </div>

      {/* La marche a suivre, avant tout : le scan reste le geste principal. */}
      <div className="card flex items-start gap-3 p-4">
        <span className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
          <ScanLine size={20} />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-ink-900">Visez le QR Code du ticket</p>
          <p className="text-ink-600">
            Ouvrez l&apos;appareil photo de votre téléphone et visez le code : l&apos;écran de
            vérification s&apos;ouvre tout seul.
          </p>
        </div>
      </div>

      <form onSubmit={chercher} className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Nom, téléphone ou numéro d'abonnement"
            value={terme}
            onChange={(event) => setTerme(event.target.value)}
          />
        </div>
        <Button type="submit" loading={chargement}>
          Chercher
        </Button>
      </form>

      {resultats === null ? (
        <div className="card">
          <EmptyState
            icon={BadgeCheck}
            title="Ticket abîmé ou oublié ?"
            description="Cherchez l'abonné par son nom, son téléphone ou son numéro d'abonnement."
          />
        </div>
      ) : resultats.length === 0 ? (
        <div className="card">
          <NoResults description="Aucun abonné ne correspond. Vérifiez l'orthographe ou le numéro." />
        </div>
      ) : (
        <div className="space-y-2">
          {resultats.map((abonnement) => {
            const etat = etatDe(abonnement);
            return (
              <Link
                key={abonnement.id}
                to={`/abonnement/${abonnement.verifyToken}`}
                className="card flex items-center gap-3 p-4 transition hover:border-brand-200"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-bold text-ink-900">{abonnement.fullName}</h2>
                    <span className={`badge ${etat.badge}`}>{etat.court}</span>
                  </div>
                  <p className="font-mono text-xs text-ink-500">{abonnement.number}</p>
                  <p className={`text-xs ${etat.accent}`}>
                    {echeance(abonnement)} &middot; jusqu&apos;au {formatShortDate(abonnement.endDate)}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-ink-400" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
