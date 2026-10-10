import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Check, Eye, EyeOff, UserCheck, AlertCircle } from 'lucide-react';
import { Curator } from '../types/question';

interface MasterAuthGateProps {
  authenticate: (id:string,password:string)=>Promise<Curator>;
  curators: Curator[];
  onAuthenticated: (selectedCurator: Curator) => void;
}


export const MasterAuthGate: React.FC<MasterAuthGateProps> = ({
  authenticate,
  curators,
  onAuthenticated,
}) => {
  const [selectedCuratorId, setSelectedCuratorId] = useState<string>('');
  const [busy,setBusy]=useState(false);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(busy) return;
    setErrorMessage('');

    if (!selectedCuratorId) {
      setErrorMessage('Por favor, selecione quem é você (Patrick, Lucas ou Thierry).');
      return;
    }

    setBusy(true);
    let verified:Curator|undefined;
    try {
      verified=await authenticate(selectedCuratorId,password);
    } catch (error: any) {
      setErrorMessage(error.message || 'Não foi possível validar a senha no servidor.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
      setPassword('');
      setBusy(false);
      return;
    }

    setBusy(false);
    const curator = verified || curators.find(c => c.id === selectedCuratorId);
    if (curator) {
      // Store authenticated state in sessionStorage so refreshing doesn't lose session during active work
      try {
        sessionStorage.setItem('apexmed_authenticated_curator_id', curator.id);
      } catch {
        // ignore
      }
      onAuthenticated(curator);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-shell-2/95 backdrop-blur-xl animate-in fade-in select-none">
      <div 
        className={`w-full max-w-lg rounded-3xl bg-shell-3 border border-white/[0.12] p-6 sm:p-8 space-y-6 shadow-[0_25px_70px_rgba(0,0,0,0.8)] transition-all ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Brand & Security Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand/20 border border-brand/40 mb-1 shadow-[0_0_24px_rgba(164,57,57,0.3)]">
            <KeyRound className="w-6 h-6 text-brand-muted" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-apex-text">
            ApexMed — Acesso Restrito
          </h2>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
              Responsáveis pela curadoria: Patrick, Lucas, Thierry.
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit}><fieldset disabled={busy} className="space-y-6">
          {/* Step 1: Select User */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-apex-readable">
              1. Qual é o seu usuário?
            </label>
            <div className="grid grid-cols-3 gap-3">
              {curators.map((c) => {
                const isSelected = selectedCuratorId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCuratorId(c.id);
                      setErrorMessage('');
                    }}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-brand/20 border-brand shadow-[0_0_20px_rgba(164,57,57,0.35)] scale-102'
                        : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md"
                      style={{ backgroundColor: c.avatarCor }}
                    >
                      {c.iniciais}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-apex-text">{c.nome}</p>
                      <p className="text-[10px] text-shell-muted">Curador</p>
                    </div>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center text-white">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Master Password */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-apex-readable">
              2. Digite a Senha Mestra de Acesso:
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage('');
                }}
                aria-label="Senha mestra"
                required
                autoComplete="current-password"
                placeholder="Insira a senha mestra..."
                className="w-full bg-shell-2 border border-white/[0.15] focus:border-brand rounded-xl px-4 py-3 text-sm text-apex-text placeholder-shell-muted outline-none transition-all pr-12 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-shell-muted hover:text-apex-text transition-colors p-1"
                title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit CTA */}
          <button
            type="submit"
            className="w-full py-3.5 rounded-full font-bold text-xs uppercase tracking-wider bg-brand hover:bg-brand-hover text-white shadow-[0_0_28px_rgba(164,57,57,0.4)] hover:shadow-[0_0_38px_rgba(164,57,57,0.6)] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <UserCheck className="w-4 h-4" />
            <span>{busy?'Entrando…':'Entrar na Curadoria'}</span>
          </button>
        </fieldset></form>

        <p className="text-center text-[11px] text-shell-muted">
          Plataforma protegida • Apenas curadores designados autorizados
        </p>
      </div>
    </div>
  );
};
