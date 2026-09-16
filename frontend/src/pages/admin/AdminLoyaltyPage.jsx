import { useCallback, useEffect, useState } from 'react';
import {
  Gift,
  Search,
  RefreshCw,
  History,
  PlusCircle,
  MinusCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { loyaltyApi } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  NoResults,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../components/ui';
import { formatDateTime } from '../../utils/format';

/**
 * Comptes fidélité : un point par commande servie, une récompense tous les
 * N points (réglage dans Paramètres). Pas de paiement en ligne : une
 * récompense se valide en salle, la serveuse confirme sur cet écran.
 */
export default function AdminLoyaltyPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'ADMIN';

  const [accounts, setAccounts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const [detail, setDetail] = useState(null);
  const [redeemTarget, setRedeemTarget] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ delta: '', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = { page };
      if (search.trim()) params.search = search.trim();
      const result = await loyaltyApi.list(params);
      setAccounts(result.accounts);
      setPagination(result.pagination);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const ouvrirDetail = async (account) => {
    setBusy(account.id);
    try {
      setDetail(await loyaltyApi.detail(account.id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const valider = async () => {
    if (!redeemTarget) return;
    setBusy(redeemTarget.id);
    try {
      await loyaltyApi.redeem(redeemTarget.id);
      toast.success('Récompense validée');
      setRedeemTarget(null);
      if (detail?.id === redeemTarget.id) setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const ouvrirAjustement = (account) => {
    setAdjustForm({ delta: '', note: '' });
    setAdjustTarget(account);
  };

  const ajuster = async (event) => {
    event.preventDefault();
    if (!adjustTarget) return;
    const delta = Number(adjustForm.delta);
    if (!delta) {
      toast.error('Le montant ne peut pas être nul');
      return;
    }
    if (adjustForm.note.trim().length < 3) {
      toast.error('Motif trop court (3 caractères minimum)');
      return;
    }
    setSaving(true);
    try {
      await loyaltyApi.adjust(adjustTarget.id, {
        delta,
        note: adjustForm.note.trim(),
      });
      toast.success('Points ajustés');
      setAdjustTarget(null);
      if (detail?.id === adjustTarget.id) setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Fidélité"
        subtitle={
          pagination
            ? `${pagination.total} compte${pagination.total > 1 ? 's' : ''} client${pagination.total > 1 ? 's' : ''}`
            : 'Un point par commande servie'
        }
        icon={Gift}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher par téléphone ou nom"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={load}>
          Actualiser
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          {search ? (
            <NoResults description="Aucun compte ne correspond à cette recherche." />
          ) : (
            <EmptyState
              icon={Gift}
              title="Aucun client fidèle pour le moment"
              description="Un compte se crée automatiquement dès qu'un client renseigne son numéro à la commande, une fois servi."
            />
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div key={account.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
              <div className="min-w-[170px] flex-1">
                <h3 className="font-bold text-ink-900">{account.name || 'Client'}</h3>
                <p className="font-mono text-xs text-ink-500">{account.phone}</p>
              </div>

              <div className="min-w-[120px] text-sm">
                <p className="flex items-center gap-1 text-ink-700">
                  <Sparkles size={14} className="text-brand" /> {account.points} point{account.points > 1 ? 's' : ''}
                </p>
                {account.rewardsAvailable > 0 && (
                  <p className="text-xs font-semibold text-emerald-600">
                    {account.rewardsAvailable} récompense{account.rewardsAvailable > 1 ? 's' : ''} disponible
                    {account.rewardsAvailable > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <div className="min-w-[120px] text-xs text-ink-500">
                Depuis le {formatDateTime(account.createdAt).split(' ')[0]}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  icon={History}
                  loading={busy === account.id}
                  onClick={() => ouvrirDetail(account)}
                >
                  Historique
                </Button>
                {account.rewardsAvailable > 0 && (
                  <Button variant="secondary" icon={Gift} onClick={() => setRedeemTarget(account)}>
                    Valider une récompense
                  </Button>
                )}
                {isAdmin && (
                  <Button variant="ghost" icon={PlusCircle} onClick={() => ouvrirAjustement(account)}>
                    Ajuster
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            icon={ChevronLeft}
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Précédent
          </Button>
          <span className="px-3 text-sm text-ink-600">
            Page {pagination.page} sur {pagination.pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pagination.pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Suivant <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {/* -------------------------- Historique ------------------------- */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.name || detail?.phone} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-ink-50 p-3 text-center">
              <div>
                <p className="text-xl font-bold text-ink-900">{detail.points}</p>
                <p className="text-xs text-ink-500">Points</p>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-600">{detail.rewardsAvailable}</p>
                <p className="text-xs text-ink-500">Disponibles</p>
              </div>
              <div>
                <p className="text-xl font-bold text-ink-400">{detail.rewardsRedeemed}</p>
                <p className="text-xs text-ink-500">Utilisées</p>
              </div>
            </div>

            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {detail.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {tx.points >= 0 ? (
                      <PlusCircle size={14} className="text-emerald-500" />
                    ) : (
                      <MinusCircle size={14} className="text-red-500" />
                    )}
                    <div>
                      <p className="text-ink-900">{TX_LABEL[tx.type] || tx.type}</p>
                      {tx.note && <p className="text-xs text-ink-500">{tx.note}</p>}
                      {tx.user && <p className="text-xs text-ink-400">par {tx.user.fullName}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.points > 0 ? 'text-emerald-600' : tx.points < 0 ? 'text-red-600' : 'text-ink-400'}`}>
                      {tx.points > 0 ? '+' : ''}
                      {tx.points}
                    </p>
                    <p className="text-xs text-ink-400">{formatDateTime(tx.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      {/* --------------------------- Ajustement ------------------------- */}
      <Modal open={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} title="Ajuster les points">
        <form id="form-ajustement" onSubmit={ajuster} className="space-y-4">
          <Field label="Points à ajouter (négatif pour retirer)" required>
            <Input
              type="number"
              value={adjustForm.delta}
              onChange={(event) => setAdjustForm({ ...adjustForm, delta: event.target.value })}
              required
            />
          </Field>
          <Field label="Motif" required>
            <Textarea
              rows={2}
              minLength={3}
              maxLength={300}
              value={adjustForm.note}
              onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })}
              required
            />
          </Field>
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdjustTarget(null)}>
            Annuler
          </Button>
          <Button type="submit" form="form-ajustement" loading={saving}>
            Enregistrer
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(redeemTarget)}
        onClose={() => setRedeemTarget(null)}
        onConfirm={valider}
        title="Valider la récompense"
        message={`Confirmez que ${redeemTarget?.name || redeemTarget?.phone || 'ce client'} a bien reçu sa récompense.`}
        confirmLabel="Valider"
        variant="success"
        loading={busy === redeemTarget?.id}
      />
    </div>
  );
}

const TX_LABEL = {
  EARN: 'Point gagné',
  REWARD_GRANTED: 'Récompense débloquée',
  REWARD_REDEEMED: 'Récompense validée',
  ADJUST: 'Ajustement manuel',
};
