import { useCallback, useEffect, useState } from 'react';
import { Settings, Save, Upload, X, ShoppingBag, Copy, Printer, Gift } from 'lucide-react';
import { restaurantApi } from '../../services/endpoints';
import { printTakeawayPoster } from '../../components/orders/printOrder';
import { imageUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { applyBrandColor } from '../../utils/color';
import DangerZone from '../../components/admin/DangerZone';
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  Toggle,
} from '../../components/ui';

const PRESET_COLORS = ['#E4572E', '#C1121F', '#F0A202', '#0E7C66', '#2563EB', '#7C3AED', '#111827'];

export default function AdminSettingsPage() {
  const { setRestaurant } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [takeaway, setTakeaway] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const restaurant = await restaurantApi.detail();
      setForm({
        name: restaurant.name || '',
        description: restaurant.description || '',
        address: restaurant.address || '',
        phone: restaurant.phone || '',
        email: restaurant.email || '',
        currency: restaurant.currency || 'FCFA',
        openingHours: restaurant.openingHours || '',
        primaryColor: restaurant.primaryColor || '#E4572E',
        welcomeMessage: restaurant.welcomeMessage || '',
        loyaltyEnabled: restaurant.loyaltyEnabled || false,
        loyaltyRewardThreshold: restaurant.loyaltyRewardThreshold || 10,
        loyaltyRewardLabel: restaurant.loyaltyRewardLabel || '',
      });
      setTakeaway(restaurant.takeaway || null);
      setLogoPreview(restaurant.logo ? imageUrl(restaurant.logo) : null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo trop volumineux (5 Mo maximum)');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => formData.append(key, value ?? ''));
      if (logoFile) formData.append('logo', logoFile);

      const updated = await restaurantApi.update(formData);
      setRestaurant((current) => ({ ...current, ...updated }));
      applyBrandColor(updated.primaryColor);
      setLogoFile(null);
      setLogoPreview(updated.logo ? imageUrl(updated.logo) : null);
      toast.success('Paramètres enregistrés');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  return (
    <div>
      <PageHeader
        title="Paramètres du restaurant"
        subtitle="Ces informations apparaissent sur la page client et sur les tickets"
        icon={Settings}
        action={
          <Button type="submit" form="settings-form" icon={Save} loading={saving}>
            Enregistrer
          </Button>
        }
      />

      <form id="settings-form" onSubmit={submit} className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Identité" />
          <div className="space-y-4 p-5">
            <Field label="Nom du restaurant" required>
              <Input
                required
                minLength={2}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>

            <Field label="Description">
              <Textarea
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Maquis & Grill - cuisine ivoirienne et grillades au feu de bois."
              />
            </Field>

            <Field label="Message d'accueil" hint="Affiche au client après le scan du QR Code">
              <Input
                maxLength={300}
                value={form.welcomeMessage}
                onChange={(event) => setForm({ ...form, welcomeMessage: event.target.value })}
                placeholder="Bienvenue chez nous. Bon appétit !"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adresse">
                <Input
                  maxLength={200}
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </Field>

              <Field label="Téléphone">
                <Input
                  maxLength={30}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>

              <Field label="Devise" hint="Ex : FCFA, EUR, USD">
                <Input
                  required
                  maxLength={10}
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Horaires d'ouverture">
              <Textarea
                rows={2}
                maxLength={500}
                value={form.openingHours}
                onChange={(event) => setForm({ ...form, openingHours: event.target.value })}
                placeholder="Lundi - Dimanche : 11h00 - 23h30"
              />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Logo" />
            <div className="p-5">
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img src={logoPreview} alt="Logo" className="h-20 w-20 rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                      }}
                      className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white"
                      aria-label="Retirer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-ink-100 dark:bg-ink-800 text-xs text-ink-400 dark:text-ink-500">
                    Aucun
                  </div>
                )}

                <label className="btn-secondary cursor-pointer">
                  <Upload size={16} />
                  Choisir un logo
                  <input type="file" accept="image/*" className="hidden" onChange={pickLogo} />
                </label>
              </div>
              <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                Format carré recommandé. JPG, PNG ou WEBP, 5 Mo maximum.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Couleur principale" subtitle="Applique à toute l'application" />
            <div className="p-5">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-ink-200 dark:border-ink-700"
                />
                <Input
                  value={form.primaryColor}
                  pattern="^#[0-9a-fA-F]{6}$"
                  onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, primaryColor: color })}
                    className={`h-8 w-8 rounded-lg border-2 transition ${
                      form.primaryColor.toUpperCase() === color ? 'border-ink-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Couleur ${color}`}
                  />
                ))}
              </div>

              <div
                className="mt-4 rounded-xl p-4 text-center text-sm font-semibold text-white"
                style={{ backgroundColor: form.primaryColor }}
              >
                Aperçu de la couleur
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Programme de fidélité"
              subtitle="Un point par commande servie, une récompense tous les N points"
              icon={Gift}
            />
            <div className="space-y-4 p-5">
              <Toggle
                checked={form.loyaltyEnabled}
                onChange={(value) => setForm({ ...form, loyaltyEnabled: value })}
                label={form.loyaltyEnabled ? 'Activé' : 'Désactivé'}
              />

              {form.loyaltyEnabled && (
                <>
                  <Field label="Récompense tous les..." hint="Nombre de commandes servies avant une récompense">
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={form.loyaltyRewardThreshold}
                      onChange={(event) =>
                        setForm({ ...form, loyaltyRewardThreshold: event.target.value })
                      }
                    />
                  </Field>

                  <Field label="Récompense proposée">
                    <Input
                      maxLength={120}
                      placeholder="Ex : Un plat offert"
                      value={form.loyaltyRewardLabel}
                      onChange={(event) => setForm({ ...form, loyaltyRewardLabel: event.target.value })}
                    />
                  </Field>
                </>
              )}
            </div>
          </Card>
        </div>
      </form>

      {/* Hors du formulaire : la vente à emporter a son propre enregistrement,
          elle ne doit pas dependre du bouton "Enregistrer" de l'identite. */}
      <TakeawayCard initial={takeaway} restaurantName={form.name} />

      {/* En dernier, volontairement : on ne tombe pas dessus par hasard. */}
      <DangerZone restaurantName={form.name} />
    </div>
  );
}

/**
 * Ouverture de la vente à emporter et affiche du comptoir.
 *
 * Le lien ne change pas quand on ferme puis rouvre : une affiche imprimee et
 * plastifiee doit rester valable. Le seul moyen de le changer est explicite.
 */
function TakeawayCard({ initial, restaurantName }) {
  const toast = useToast();
  const [takeaway, setTakeaway] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => setTakeaway(initial), [initial]);

  if (!takeaway) return null;

  const enregistrer = async (payload) => {
    setBusy(true);
    try {
      const updated = await restaurantApi.setTakeaway(payload);
      setTakeaway(updated.takeaway);
      toast.success(
        payload.regenerate
          ? 'Nouveau lien généré : réimprimez l\'affiche du comptoir'
          : payload.enabled
            ? 'Vente à emporter ouverte'
            : 'Vente à emporter fermée'
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(takeaway.url);
      toast.success('Lien copié');
    } catch {
      toast.error('Copie impossible : sélectionnez le lien à la main');
    }
  };

  return (
    <Card className="mt-5">
      <CardHeader
        title="Commandes à emporter"
        subtitle="Un client sans table commande depuis son téléphone et retire au comptoir"
        icon={ShoppingBag}
      />

      <div className="p-5">
        <Toggle
          checked={takeaway.enabled}
          disabled={busy}
          onChange={(value) => enregistrer({ enabled: value })}
          label={takeaway.enabled ? 'Ouvertes' : 'Fermées'}
        />

        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          {takeaway.enabled
            ? 'Les clients peuvent commander à emporter. Chaque commande reçoit un code de retrait.'
            : 'Le QR Code du comptoir affiche un message de fermeture. Les tables ne sont pas concernées.'}
        </p>

        {takeaway.enabled && takeaway.url && (
          <div className="mt-5 space-y-4 border-t border-ink-100 dark:border-ink-700 pt-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <img
                src={takeaway.qrDataUrl}
                alt="QR Code des commandes à emporter"
                className="h-32 w-32 shrink-0 rounded-xl border border-ink-100 dark:border-ink-700"
              />

              <div className="min-w-0 flex-1">
                <p className="label">Adresse de l&apos;affiche</p>
                <p className="break-all rounded-xl bg-ink-50 dark:bg-ink-900 px-3 py-2 font-mono text-xs text-ink-700 dark:text-ink-200">
                  {takeaway.url}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" icon={Copy} onClick={copier}>
                    Copier le lien
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Printer}
                    onClick={() => printTakeawayPoster({ name: restaurantName }, takeaway)}
                  >
                    Imprimer l&apos;affiche
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-xs text-amber-900 dark:text-amber-300">
                Ce lien ne change pas quand vous fermez puis rouvrez : votre affiche reste valable.
                Ne le régénérez que s&apos;il a été diffusé par erreur - l&apos;ancienne affiche
                cessera alors de fonctionner.
              </p>
              {confirmReset ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    loading={busy}
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => enregistrer({ enabled: true, regenerate: true })}
                  >
                    Oui, générer un nouveau lien
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                    Annuler
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-300 underline"
                >
                  Générer un nouveau lien
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
