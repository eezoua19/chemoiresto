import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ChefHat, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Field, Footer, Input, LoadingState } from '../components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (loading) return <LoadingState />;
  if (user) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin/dashboard' : '/serveuse/dashboard'} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const loggedUser = await login(form);
      toast.success(`Bienvenue ${loggedUser.firstName}`);
      const target =
        location.state?.from && location.state.from !== '/login'
          ? location.state.from
          : loggedUser.role === 'ADMIN'
            ? '/admin/dashboard'
            : '/serveuse/dashboard';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mb-3 inline-flex rounded-2xl bg-brand-500 p-3 text-white shadow-float">
            <ChefHat size={28} />
          </span>
          <h1 className="text-2xl font-bold text-white">Espace professionnel</h1>
          <p className="mt-1 text-sm text-ink-300">
            Connectez-vous pour gérer les commandes et le menu
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-float">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <Field label="Adresse email" required>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                type="email"
                autoComplete="email"
                required
                className="pl-9"
                placeholder="vous@restaurant.ci"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
          </Field>

          <Field label="Mot de passe" required>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="pl-9 pr-10"
                placeholder="********"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-ink-700"
                aria-label={showPassword ? 'Masquer' : 'Afficher'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Button type="submit" loading={submitting} className="w-full">
            Se connecter
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-400">
          Les clients n&apos;ont pas besoin de compte : ils scannent simplement le QR Code de leur table.
        </p>

        <Footer className="text-white/70" />
      </div>
    </div>
  );
}
