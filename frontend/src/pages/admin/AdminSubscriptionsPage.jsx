import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Plus,
  Search,
  RefreshCw,
  Printer,
  Download,
  Pencil,
  RotateCcw,
  PauseCircle,
  PlayCircle,
  Ban,
  Trash2,
  QrCode,
  ScanLine,
  Users,
  CalendarClock,
  History,
} from 'lucide-react';
import { subscriptionApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { useToast } from '../../context/ToastContext';
import { printSubscriptionTicket } from '../../components/subscriptions/printSubscription';
// Chargé seulement quand on ouvre le scanner : jsQR pèse ~50 Ko compressés, et
// le client qui consulte le menu sur sa data n'a aucune raison de les payer.
const QrScanner = lazy(() => import('../../components/subscriptions/QrScanner'));
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  NoResults,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from '../../components/ui';
import { formatDateTime, formatMoney, formatShortDate } from '../../utils/format';
import {
  ETATS,
  FORMULES,
  aujourdhuiISO,
  echeance,
  etatDe,
  expirationProposee,
} from '../../utils/subscription';

const FILTRES = [
  { value: '', label: 'Tous les abonnements' },
  { value: 'VALIDE', label: 'Valides' },
  { value: 'BIENTOT', label: 'Bientôt expirés' },
  { value: 'EXPIRE', label: 'Expirés' },
  { value: 'SUSPENDU', label: 'Suspendus' },
  { value: 'INACTIF', label: 'Désactivés' },
];

const FORMULAIRE_VIDE = {
  firstName: '',
  lastName: '',
  phone: '',
  plan: 'MENSUEL',
  startDate: aujourdhuiISO(),
  endDate: expirationProposee(aujourdhuiISO(), 'MENSUEL'),
  amount: '',
  note: '',
};

/**
 * Abonnements CHEMOIRESTO.
 *
 * L'abonné n'a ni compte ni mot de passe : tout part d'ici. L'administration
 * crée la fiche, le système fabrique le numéro et le QR Code, et le client
 * repart avec un ticket papier — sa seule preuve.
 */
export default function AdminSubscriptionsPage() {
  const { restaurant } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [filters, setFilters] = useState({ search: '', state: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(FORMULAIRE_VIDE);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [renewTarget, setRenewTarget] = useState(null);
  const [renewPlan, setRenewPlan] = useState('MENSUEL');
  const [disableTarget, setDisableTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [scannerOuvert, setScannerOuvert] = useState(false);

  // ------------------------------ chargement ------------------------------

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = {};
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.state) params.state = filters.state;

      const [liste, compteurs] = await Promise.all([
        subscriptionApi.list(params),
        subscriptionApi.stats(),
      ]);
      setSubscriptions(liste.subscriptions);
      setStats(compteurs);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Un passage enregistre au comptoir, ou une fiche modifiee depuis un autre
  // appareil : la liste et les compteurs se remettent a jour tout seuls.
  useSocketEvent('subscription_used', load);
  useSocketEvent('subscription_updated', load);
  useSocketEvent('subscription_deleted', load);

  // ------------------------------- création -------------------------------

  const ouvrirCreation = () => {
    setEditing(null);
    setForm({
      ...FORMULAIRE_VIDE,
      startDate: aujourdhuiISO(),
      endDate: expirationProposee(aujourdhuiISO(), 'MENSUEL'),
    });
    setFormOpen(true);
  };

  const ouvrirEdition = (abonnement) => {
    setEditing(abonnement);
    setForm({
      firstName: abonnement.firstName,
      lastName: abonnement.lastName,
      phone: abonnement.phone,
      plan: abonnement.plan,
      startDate: String(abonnement.startDate).slice(0, 10),
      endDate: String(abonnement.endDate).slice(0, 10),
      amount: abonnement.amount ?? '',
      note: abonnement.note || '',
    });
    setFormOpen(true);
  };

  /** Changer la formule ou la date de début recalcule l'expiration proposée. */
  const majFormulaire = (champs) => {
    setForm((actuel) => {
      const suivant = { ...actuel, ...champs };
      if (champs.plan !== undefined || champs.startDate !== undefined) {
        suivant.endDate = expirationProposee(suivant.startDate, suivant.plan);
      }
      return suivant;
    });
  };

  const enregistrer = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        plan: form.plan,
        startDate: form.startDate,
        endDate: form.endDate,
        amount: form.amount === '' ? null : Number(form.amount),
        note: form.note.trim() || null,
      };

      if (editing) {
        await subscriptionApi.update(editing.id, payload);
        toast.success('Abonnement mis à jour');
        setFormOpen(false);
        await load();
      } else {
        const cree = await subscriptionApi.create(payload);
        toast.success(`Abonnement ${cree.number} créé`);
        setFormOpen(false);
        await load();
        // Le ticket s'ouvre aussitôt : c'est ce que le client attend au comptoir.
        setDetail(cree);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------- actions --------------------------------

  const ouvrirDetail = async (abonnement) => {
    setBusy(abonnement.id);
    try {
      setDetail(await subscriptionApi.detail(abonnement.id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const imprimer = (abonnement) => {
    try {
      printSubscriptionTicket(abonnement, abonnement.ticket, restaurant);
    } catch (err) {
      toast.error(err.message);
    }
  };

  /**
   * Suppression definitive, historique compris.
   *
   * Elle vit a cote de « Desactiver » et non a sa place : desactiver reste le
   * geste courant, supprimer sert aux fiches creees par erreur.
   */
  const supprimer = async () => {
    const cible = deleteTarget;
    if (!cible) return;
    setBusy(cible.id);
    try {
      const reponse = await subscriptionApi.remove(cible.id);
      toast.success(reponse.message);
      setDeleteTarget(null);
      // La fiche ouverte n'existe plus : on la ferme plutot que d'afficher un
      // ticket qui ne correspond a rien.
      if (detail && detail.id === cible.id) setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const changerStatut = async (abonnement, status) => {
    setBusy(abonnement.id);
    try {
      const result = await subscriptionApi.setStatus(abonnement.id, status);
      toast.success(
        status === 'ACTIVE'
          ? 'Abonnement réactivé'
          : status === 'SUSPENDED'
            ? 'Abonnement suspendu'
            : 'Abonnement désactivé'
      );
      setDisableTarget(null);
      if (detail && detail.id === abonnement.id) setDetail({ ...detail, ...result });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const renouveler = async () => {
    if (!renewTarget) return;
    setBusy(renewTarget.id);
    try {
      const result = await subscriptionApi.renew(renewTarget.id, { plan: renewPlan });
      toast.success(`Renouvelé jusqu'au ${formatShortDate(result.endDate)}`);
      setRenewTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  // Rappel stable : l'effet du scanner ne doit pas se relancer a chaque rendu.
  const surDetection = useCallback(
    (jeton) => {
      setScannerOuvert(false);
      navigate(`/abonnement/${jeton}`);
    },
    [navigate]
  );

  // -------------------------------- rendu ---------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Abonnements CHEMOIRESTO"
        subtitle="Créez la fiche, le système fabrique le numéro, le QR Code et le ticket"
        icon={BadgeCheck}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" icon={ScanLine} onClick={() => setScannerOuvert(true)}>
              Scanner
            </Button>
            <Button icon={Plus} onClick={ouvrirCreation}>
              Nouvel abonnement
            </Button>
          </div>
        }
      />

      {/* ---------------------------- chiffres ---------------------------- */}
      {stats && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Abonnements"
            value={stats.counts.total}
            icon={Users}
            tone="brand"
            hint={`${stats.counts.inactifs} désactivé(s)`}
          />
          <StatCard
            label="Valides"
            value={stats.counts.valides}
            icon={BadgeCheck}
            tone="emerald"
            hint={`${stats.counts.suspendus} suspendu(s)`}
          />
          <StatCard
            label="Bientôt expirés"
            value={stats.counts.bientot}
            icon={CalendarClock}
            tone="amber"
            hint={`${stats.counts.expires} déjà expiré(s)`}
          />
          <StatCard
            label="Utilisations"
            value={stats.usages.total}
            icon={History}
            tone="sky"
            hint={`${stats.usages.month} ce mois-ci`}
          />
        </div>
      )}

      {/* ---------------------------- recherche --------------------------- */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Nom, téléphone ou numéro d'abonnement"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </div>
        <Select
          value={filters.state}
          onChange={(event) => setFilters({ ...filters, state: event.target.value })}
        >
          {FILTRES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Actualiser
        </Button>
      </div>

      {/* ------------------------------ liste ----------------------------- */}
      {subscriptions.length === 0 ? (
        <Card>
          {filters.search || filters.state ? (
            <NoResults description="Aucun abonnement ne correspond à cette recherche." />
          ) : (
            <EmptyState
              icon={BadgeCheck}
              title="Aucun abonnement pour le moment"
              description="Créez le premier : le système génère le numéro, le QR Code et le ticket à remettre au client."
              action={
                <Button icon={Plus} onClick={ouvrirCreation}>
                  Nouvel abonnement
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((abonnement) => {
            const etat = etatDe(abonnement);
            return (
              <div key={abonnement.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <div className="min-w-[190px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-ink-900">{abonnement.fullName}</h3>
                    <span className={`badge ${etat.badge}`}>{etat.court}</span>
                  </div>
                  <p className="font-mono text-xs text-ink-500">{abonnement.number}</p>
                </div>

                <div className="min-w-[150px] text-sm">
                  <p className="text-ink-700">{abonnement.phone}</p>
                  <p className="text-xs text-ink-500">{abonnement.planLabel}</p>
                </div>

                <div className="min-w-[170px] text-sm">
                  <p className="text-ink-700">
                    {formatShortDate(abonnement.startDate)} &rarr; {formatShortDate(abonnement.endDate)}
                  </p>
                  <p className={`text-xs ${etat.accent}`}>{echeance(abonnement)}</p>
                </div>

                <div className="min-w-[90px] text-sm">
                  <p className="text-ink-700">
                    {abonnement.usageCount} passage{abonnement.usageCount > 1 ? 's' : ''}
                  </p>
                  {abonnement.renewalCount > 0 && (
                    <p className="text-xs text-ink-500">
                      {abonnement.renewalCount} renouvellement{abonnement.renewalCount > 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={QrCode}
                    loading={busy === abonnement.id}
                    onClick={() => ouvrirDetail(abonnement)}
                  >
                    Ticket
                  </Button>
                  <Button variant="ghost" icon={Pencil} onClick={() => ouvrirEdition(abonnement)}>
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    icon={RotateCcw}
                    onClick={() => {
                      setRenewTarget(abonnement);
                      setRenewPlan(abonnement.plan);
                    }}
                  >
                    Renouveler
                  </Button>

                  {abonnement.status === 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      icon={PauseCircle}
                      className="text-amber-700 hover:bg-amber-50"
                      onClick={() => changerStatut(abonnement, 'SUSPENDED')}
                    >
                      Suspendre
                    </Button>
                  )}
                  {abonnement.status !== 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      icon={PlayCircle}
                      className="text-emerald-700 hover:bg-emerald-50"
                      onClick={() => changerStatut(abonnement, 'ACTIVE')}
                    >
                      Réactiver
                    </Button>
                  )}
                  {abonnement.status !== 'INACTIVE' && (
                    <Button
                      variant="ghost"
                      icon={Ban}
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDisableTarget(abonnement)}
                    >
                      Désactiver
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    className="text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteTarget(abonnement)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------- dernières utilisations -------------------- */}
      {stats && stats.recent.length > 0 && (
        <Card className="mt-5">
          <CardHeader
            title="Dernières utilisations"
            subtitle="Chaque passage enregistré au comptoir"
            icon={History}
          />
          <div className="divide-y divide-ink-100">
            {stats.recent.map((passage) => (
              <div key={passage.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-[150px] flex-1 font-semibold text-ink-900">
                  {passage.subscription.fullName}
                </span>
                <span className="font-mono text-xs text-ink-500">{passage.subscription.number}</span>
                <span className="text-ink-600">{passage.type}</span>
                {passage.order && (
                  <span className="font-mono text-xs text-ink-500">{passage.order.orderNumber}</span>
                )}
                <span className="text-xs text-ink-500">{formatDateTime(passage.createdAt)}</span>
                {passage.user && <span className="text-xs text-ink-400">par {passage.user.fullName}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* --------------------------- formulaire --------------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Modifier l'abonnement" : 'Nouvel abonnement'}
        subtitle={editing ? editing.number : "Le numéro et le QR Code sont générés automatiquement"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="form-abonnement" loading={saving}>
              {editing ? 'Enregistrer' : "Créer l'abonnement"}
            </Button>
          </>
        }
      >
        <form id="form-abonnement" onSubmit={enregistrer} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" required>
              <Input
                required
                minLength={2}
                maxLength={60}
                value={form.firstName}
                onChange={(event) => majFormulaire({ firstName: event.target.value })}
                placeholder="Awa"
              />
            </Field>
            <Field label="Nom" required>
              <Input
                required
                minLength={2}
                maxLength={60}
                value={form.lastName}
                onChange={(event) => majFormulaire({ lastName: event.target.value })}
                placeholder="Kouassi"
              />
            </Field>
          </div>

          <Field label="Téléphone" required hint="C'est par là que vous le joindrez">
            <Input
              required
              type="tel"
              inputMode="tel"
              maxLength={30}
              value={form.phone}
              onChange={(event) => majFormulaire({ phone: event.target.value })}
              placeholder="07 00 00 00 00"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Formule" required>
              <Select
                value={form.plan}
                onChange={(event) => majFormulaire({ plan: event.target.value })}
              >
                {FORMULES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label} ({f.jours} j)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Début" required>
              <Input
                required
                type="date"
                value={form.startDate}
                onChange={(event) => majFormulaire({ startDate: event.target.value })}
              />
            </Field>
            <Field label="Expiration" required hint="Modifiable">
              <Input
                required
                type="date"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Montant payé" hint="Facultatif, en FCFA">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="25000"
            />
          </Field>

          <Field label="Note interne" hint="Visible de vous seule">
            <Textarea
              rows={2}
              maxLength={500}
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="Paiement en espèces, à rappeler avant l'échéance..."
            />
          </Field>
        </form>
      </Modal>

      {/* ----------------------------- ticket ----------------------------- */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Ticket d'abonnement"
        subtitle={detail ? `${detail.fullName} - ${detail.number}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Fermer
            </Button>
            {detail?.ticket && (
              <a
                className="btn-secondary"
                href={detail.ticket.qrDataUrl}
                download={`${detail.number}.png`}
              >
                <Download size={16} /> QR Code
              </a>
            )}
            {detail && (
              <Button icon={Printer} onClick={() => imprimer(detail)}>
                Imprimer le ticket
              </Button>
            )}
          </>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-4 text-center ${etatDe(detail).bloc}`}>
              <p className="text-lg font-extrabold">{etatDe(detail).label}</p>
              <p className="text-sm">{echeance(detail)}</p>
            </div>

            {detail.ticket && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={detail.ticket.qrDataUrl}
                  alt={`QR Code de l'abonnement ${detail.number}`}
                  className="h-44 w-44 rounded-xl border border-ink-100"
                />
                <p className="break-all rounded-xl bg-ink-50 px-3 py-2 text-center font-mono text-[11px] text-ink-600">
                  {detail.ticket.url}
                </p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-500">Formule</dt>
              <dd className="text-right font-semibold text-ink-900">{detail.planLabel}</dd>
              <dt className="text-ink-500">Téléphone</dt>
              <dd className="text-right font-semibold text-ink-900">{detail.phone}</dd>
              <dt className="text-ink-500">Période</dt>
              <dd className="text-right font-semibold text-ink-900">
                {formatShortDate(detail.startDate)} &rarr; {formatShortDate(detail.endDate)}
              </dd>
              {detail.amount !== null && (
                <>
                  <dt className="text-ink-500">Montant payé</dt>
                  <dd className="text-right font-semibold text-ink-900">
                    {formatMoney(detail.amount, restaurant?.currency)}
                  </dd>
                </>
              )}
              <dt className="text-ink-500">Passages</dt>
              <dd className="text-right font-semibold text-ink-900">{detail.usageCount ?? 0}</dd>
            </dl>

            {detail.note && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{detail.note}</p>
            )}

            {detail.usages && detail.usages.length > 0 && (
              <div>
                <p className="label">Historique des utilisations</p>
                <div className="max-h-56 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100">
                  {detail.usages.map((passage) => (
                    <div key={passage.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-xs">
                      <span className="font-semibold text-ink-800">{passage.type}</span>
                      <span className="text-ink-600">{formatDateTime(passage.createdAt)}</span>
                      {passage.order && (
                        <span className="font-mono text-ink-500">{passage.order.orderNumber}</span>
                      )}
                      {passage.user && <span className="text-ink-400">par {passage.user.fullName}</span>}
                      {passage.note && <span className="italic text-ink-500">{passage.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* -------------------------- renouvellement ------------------------- */}
      <Modal
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        title="Renouveler l'abonnement"
        subtitle={renewTarget ? `${renewTarget.fullName} - ${renewTarget.number}` : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewTarget(null)}>
              Annuler
            </Button>
            <Button onClick={renouveler} loading={busy === renewTarget?.id}>
              Renouveler
            </Button>
          </>
        }
      >
        {renewTarget && (
          <div className="space-y-4">
            <Field label="Nouvelle formule">
              <Select value={renewPlan} onChange={(event) => setRenewPlan(event.target.value)}>
                {FORMULES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label} ({f.jours} j)
                  </option>
                ))}
              </Select>
            </Field>
            <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {renewTarget.daysLeft >= 0
                ? `Il reste ${renewTarget.daysLeft} jour(s) : le nouveau cycle démarre à la suite, aucun jour n'est perdu.`
                : "L'abonnement est expiré : le nouveau cycle démarre aujourd'hui."}
            </p>
            <p className="text-xs text-ink-500">
              Le numéro et le QR Code ne changent pas : le client garde son ticket.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(disableTarget)}
        onClose={() => setDisableTarget(null)}
        onConfirm={() => changerStatut(disableTarget, 'INACTIVE')}
        title="Désactiver l'abonnement"
        message={
          disableTarget
            ? `Désactiver l'abonnement de ${disableTarget.fullName} (${disableTarget.number}) ? Le scan affichera ABONNEMENT INACTIF. L'historique des passages est conservé et vous pourrez le réactiver.`
            : ''
        }
        confirmLabel="Désactiver"
        loading={busy === disableTarget?.id}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={supprimer}
        title="Supprimer définitivement l'abonnement"
        message={
          deleteTarget
            ? `Supprimer l'abonnement de ${deleteTarget.fullName} (${deleteTarget.number}) ?${
                deleteTarget.usageCount
                  ? ` Ses ${deleteTarget.usageCount} passage${
                      deleteTarget.usageCount > 1 ? 's' : ''
                    } enregistré${deleteTarget.usageCount > 1 ? 's' : ''} seront effacés avec lui.`
                  : ''
              } Cette action est irréversible et le ticket déjà remis au client cessera de fonctionner. Pour simplement bloquer l'accès, utilisez plutôt Désactiver.`
            : ''
        }
        confirmLabel="Supprimer définitivement"
        loading={busy === deleteTarget?.id}
      />

      {scannerOuvert && (
        <Suspense fallback={null}>
          <QrScanner open onClose={() => setScannerOuvert(false)} onDetect={surDetection} />
        </Suspense>
      )}
    </div>
  );
}
