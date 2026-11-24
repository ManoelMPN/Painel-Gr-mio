import React, { useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import type { AuthUser } from '../../shared/types.ts';

interface AuthModalProps {
  isOpen: boolean;
  masterConfigured: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  masterConfigured,
  onClose,
  onAuthenticated,
}) => {
  const [name, setName] = useState('Coordenação Estadual SEDUC-SP');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isFirstSetup = !masterConfigured;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isFirstSetup && password !== confirmPassword) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isFirstSetup ? '/api/auth/setup-master' : '/api/auth/login';
      const payload = isFirstSetup ? { name, email, password } : { email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Falha na autenticação.');
      }
      onAuthenticated(data.token, data.user);
      setPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            {isFirstSetup ? (
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            )}
            <h2
              id="auth-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {isFirstSetup ? 'Primeiro Acesso — Administração' : 'Acesso Administrativo'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de acesso"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {isFirstSetup
              ? 'Defina o e-mail e a senha do administrador principal para liberar o envio de planilhas, sincronização com o Supabase e criação de perfis regionais ou gerais.'
              : 'A visualização dos registros das escolas e diretorias é aberta. Entre com seu e-mail e senha cadastrados para definir metas, gerar comunicados ou gerenciar a base.'}
          </p>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {isFirstSetup && (
            <div>
              <label
                htmlFor="auth-name"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Nome do Administrador Principal
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
            >
              E-mail institucional ou cadastrado
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="nome@educacao.sp.gov.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
            >
              Senha
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={isFirstSetup ? 'new-password' : 'current-password'}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {isFirstSetup && (
            <div>
              <label
                htmlFor="auth-password-confirm"
                className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Confirmar Senha
              </label>
              <input
                id="auth-password-confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0"
            >
              {loading
                ? 'Validando...'
                : isFirstSetup
                  ? 'Criar Conta Master'
                  : 'Entrar no Painel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
