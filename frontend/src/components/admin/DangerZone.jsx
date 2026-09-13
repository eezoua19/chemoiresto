import { useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldCheck } from 'lucide-react';
import { resetApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { Button, Card, CardHeader, Field, Input, Modal, Toggle } from '../ui';

const GARDE = [
  'Le restaurant et ses paramètres',
  'Votre compte et ceux des serveuses',
  'Les catégories, les plats et leurs options',
  'Les tables et leurs QR Codes — les affiches collées restent valables',
  'Les sauvegardes déjà prises',
];

const EFFACE = [
  'Toutes les commandes et leur historique',
  'Les appels serveuse et demandes d’addition',
  'Les abonnements et tous les passages enregistrés',
  'Les fiches clients et les notifications',
  'Les clôtures de journée — donc les recettes',
  'Le journal des actions',
];

/**
 * Remise à zéro des données d'exploitation.
 *
 * Le bouton le plus dangereux de l'application : il est donc le dernier de la
 * page, isolé, rouge, et il exige que le nom du restaurant soit tapé à la
 * main. Un geste destructeur ne doit jamais tenir en un seul clic.
 *
 * Le filet ne dépend pas de l'utilisateur : le serveur prend une sauvegarde
 * complète avant d'effacer, et refuse d'effacer si elle échoue.
 */
export default function DangerZone({ restaurantName }) {
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [avecMenus, setAvecMenus] = useState(false);
  const [busy, setBusy] = useState(false);

  const nomCorrect =
    saisie.trim().replace(/\s+/g, ' ').toLowerCase() ===
    String(restaurantName || '').trim().replace(/\s+/g, ' ').toLowerCase();

  const fermer = () => {
    if (busy) return;
    setOuvert(false);
    setSaisie('');
    setAvecMenus(false);
  };

  const remettreAZero = async () => {
    setBusy(true);
    try {
      const resultat = await resetApi.run({ confirmation: saisie, resetMenus: avecMenus });
      toast.success(resultat.message, 8000);
      setOuvert(false);
      // Toutes les pages ouvertes montrent des chiffres qui n'existent plus :
      // on recharge plutôt que de laisser un tableau de bord fantôme.
      setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="mt-5 border-red-200">
        <CardHeader
          title="Zone dangereuse"
          subtitle="À n’utiliser qu’avant une vraie ouverture, ou après une période d’essai"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">Remise à zéro des données</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Efface commandes, abonnements, recettes et journal. Garde votre carte, vos tables et
              vos QR Codes. Une sauvegarde est prise automatiquement avant.
            </p>
          </div>
          <Button variant="danger" icon={RotateCcw} onClick={() => setOuvert(true)}>
            Remettre à zéro
          </Button>
        </div>
      </Card>

      <Modal
        open={ouvert}
        onClose={fermer}
        title="Remise à zéro des données"
        subtitle="Cette action est irréversible"
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={fermer} disabled={busy}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={remettreAZero}
              disabled={!nomCorrect}
              loading={busy}
            >
              Effacer définitivement
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <p className="text-xs text-emerald-900">
              Une sauvegarde complète est prise <strong>avant</strong> la suppression. Si elle
              échoue, rien n’est effacé. Vous la retrouverez dans Sauvegardes, téléchargeable.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-red-800">
                <AlertTriangle size={13} /> Sera effacé
              </p>
              <ul className="space-y-1 text-xs text-red-900/85">
                {EFFACE.map((ligne) => (
                  <li key={ligne}>• {ligne}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
              <p className="mb-1.5 text-xs font-bold text-ink-700">Sera conservé</p>
              <ul className="space-y-1 text-xs text-ink-600">
                {GARDE.map((ligne) => (
                  <li key={ligne}>• {ligne}</li>
                ))}
              </ul>
            </div>
          </div>

          <Toggle
            checked={avecMenus}
            onChange={setAvecMenus}
            label="Effacer aussi les menus du jour déjà créés"
          />

          <Field label={`Pour confirmer, saisissez « ${restaurantName} »`}>
            <Input
              value={saisie}
              onChange={(event) => setSaisie(event.target.value)}
              placeholder={restaurantName}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
