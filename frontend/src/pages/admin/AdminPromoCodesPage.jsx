import { useCallback, useEffect, useState } from 'react';
import { Tag, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { promoCodeApi } from '../../services/endpoints';
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
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { formatDateTime, formatMoney } from '../../utils/format';

const EMPTY_FORM = {
  code: '',
  type: 'PERCENT',
  value: '',
  minOrderAmount: '',
  maxUses: '',
  expiresAt: '',
};

const STATUS_LABEL = {
  ACTIVE: { label: 'Actif', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  INACTIVE: { label: 'Désactivé', className: 'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-300' },
  EXPIRED: { label: 'Expiré', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  EXHAUSTED: { label: 'Épuisé', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

/**
 * Codes promo : remise en pourcentage ou en montant fixe, calculée et
 * validée côté serveur à la commande. Cette page ne fait qu'editer les
 * regles (code, valeur, plafond, expiration) - jamais un montant final.
 */
export default function AdminPromoCodesPage() {
  const toast = useToast();
  const [promoCodes, setPromoCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null); // null = fermé, {} = creation, {...} = edition
  const [form, setForm] = useState(EMPTY_FORM);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPromoCodes(await promoCodeApi.list());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing({});
  };

  const openEdit = (promoCode) => {
    setForm({
      code: promoCode.code,
      type: promoCode.type,
      value: String(promoCode.value),
      minOrderAmount: promoCode.minOrderAmount != null ? String(promoCode.minOrderAmount) : '',
      maxUses: promoCode.maxUses != null ? String(promoCode.maxUses) : '',
      expiresAt: promoCode.expiresAt ? promoCode.expiresAt.slice(0, 10) : '',
    });
    setEditing(promoCode);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.code.trim() || !form.value) {
      toast.error('Code et valeur sont requis');
      return;
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value),
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
    };

    setSaving(true);
    try {
      if (editing?.id) {
        await promoCodeApi.update(editing.id, payload);
        toast.success('Code promo modifié');
      } else {
        await promoCodeApi.create(payload);
        toast.success('Code promo créé');
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (promoCode) => {
    setBusy(promoCode.id);
    try {
      await promoCodeApi.update(promoCode.id, { isActive: !promoCode.isActive });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(removeTarget.id);
    try {
      const result = await promoCodeApi.remove(removeTarget.id);
      toast.success(result?.isActive === false ? 'Code promo désactivé (déjà utilisé)' : 'Code promo supprimé');
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
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
        title="Codes promo"
        subtitle={`${promoCodes.length} code${promoCodes.length > 1 ? 's' : ''}`}
        icon={Tag}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" icon={RefreshCw} onClick={load}>
              Actualiser
            </Button>
            <Button icon={Plus} onClick={openCreate}>
              Nouveau code
            </Button>
          </div>
        }
      />

      {promoCodes.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tag}
            title="Aucun code promo"
            description="Créez un code pourcentage ou montant fixe pour vos clients."
            action={
              <Button icon={Plus} onClick={openCreate}>
                Nouveau code
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {promoCodes.map((promoCode) => {
            const status = STATUS_LABEL[promoCode.status] || STATUS_LABEL.ACTIVE;
            return (
              <div key={promoCode.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <div className="min-w-[140px] flex-1">
                  <h3 className="font-mono font-bold text-ink-900 dark:text-ink-50">{promoCode.code}</h3>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {promoCode.type === 'PERCENT' ? `${promoCode.value}%` : formatMoney(promoCode.value, 'FCFA')}
                    {promoCode.minOrderAmount ? ` · min. ${formatMoney(promoCode.minOrderAmount, 'FCFA')}` : ''}
                  </p>
                </div>

                <div className="min-w-[110px] text-sm text-ink-700 dark:text-ink-200">
                  {promoCode.usesCount} utilisé{promoCode.usesCount > 1 ? 's' : ''}
                  {promoCode.maxUses ? ` / ${promoCode.maxUses}` : ''}
                </div>

                <div className="min-w-[130px] text-xs text-ink-500 dark:text-ink-400">
                  {promoCode.expiresAt ? `Expire le ${formatDateTime(promoCode.expiresAt).split(' ')[0]}` : 'Sans expiration'}
                </div>

                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                  {status.label}
                </span>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    loading={busy === promoCode.id}
                    onClick={() => toggleActive(promoCode)}
                  >
                    {promoCode.isActive ? 'Désactiver' : 'Activer'}
                  </Button>
                  <Button variant="ghost" icon={Pencil} onClick={() => openEdit(promoCode)}>
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setRemoveTarget(promoCode)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Modifier le code promo' : 'Nouveau code promo'}
      >
        <form id="form-promo-code" onSubmit={submit} className="space-y-4">
          <Field label="Code" required hint="Sera converti en majuscules">
            <Input
              value={form.code}
              maxLength={40}
              placeholder="Ex : BIENVENUE10"
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                <option value="PERCENT">Pourcentage</option>
                <option value="FIXED">Montant fixe</option>
              </Select>
            </Field>
            <Field label={form.type === 'PERCENT' ? 'Valeur (%)' : 'Valeur (FCFA)'} required>
              <Input
                type="number"
                min="0"
                max={form.type === 'PERCENT' ? 100 : undefined}
                step="0.01"
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant minimum (facultatif)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.minOrderAmount}
                onChange={(event) => setForm({ ...form, minOrderAmount: event.target.value })}
              />
            </Field>
            <Field label="Utilisations max (facultatif)">
              <Input
                type="number"
                min="1"
                step="1"
                value={form.maxUses}
                onChange={(event) => setForm({ ...form, maxUses: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Date d'expiration (facultatif)">
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            />
          </Field>
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Annuler
          </Button>
          <Button type="submit" form="form-promo-code" loading={saving}>
            Enregistrer
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        title="Supprimer le code promo"
        message={`Confirmez la suppression de "${removeTarget?.code}". S'il a déjà été utilisé, il sera désactivé plutôt que supprimé.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={busy === removeTarget?.id}
      />
    </div>
  );
}
