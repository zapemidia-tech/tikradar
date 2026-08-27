'use client';

import { useState } from 'react';
import { BriefcaseBusiness, Search, Sparkles, Store, Users } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const opts = [
  ['Sou afiliado', Users],
  ['Sou vendedor', Store],
  ['Sou agência', BriefcaseBusiness],
  ['Faço pesquisa de produtos', Search],
] as const;

const cats = [
  'Beleza',
  'Casa',
  'Eletrônicos',
  'Moda',
  'Acessórios',
  'Saúde e bem-estar',
  'Automotivo',
  'Ferramentas',
  'Esportes',
  'Pets',
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);

  async function continueFromStep1() {
    setAccountError(null);
    setAccountLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({ email, password });
    setAccountLoading(false);

    if (error) {
      setAccountError(error.message);
      return;
    }

    setSelected([]);
    setStep(2);
  }

  const step1Ready = selected.length > 0 && email.length > 0 && password.length >= 6;

  return (
    <main className="onboarding">
      <a className="brand" href="/">
        <span className="brand-mark">
          <Sparkles />
        </span>
        TikRadar
      </a>
      <div className="steps">
        <span className="done">1</span>
        <i />
        <span className={step === 2 ? 'done' : ''}>2</span>
      </div>
      <section>
        <p className="eyebrow green">PASSO {step} DE 2</p>
        <h1>{step === 1 ? 'Crie sua conta e escolha seu objetivo' : 'Quais categorias você acompanha?'}</h1>
        <p>
          {step === 1
            ? 'Isso nos ajuda a personalizar seus insights.'
            : 'Selecione quantas quiser. Você pode alterar depois.'}
        </p>
        {step === 1 ? (
          <>
            <div className="option-grid" style={{ marginBottom: '1rem' }}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
              </label>
            </div>
            {accountError && <p role="alert">{accountError}</p>}
            <div className="option-grid">
              {opts.map(([x, Icon]) => (
                <button className={selected.includes(x) ? 'active' : ''} onClick={() => setSelected([x])} key={x}>
                  <Icon />
                  <strong>{x}</strong>
                  <span>Recomendações pensadas para seu perfil.</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="category-select">
            {cats.map((x) => (
              <button
                className={selected.includes(x) ? 'active' : ''}
                onClick={() => setSelected((s) => (s.includes(x) ? s.filter((v) => v !== x) : [...s, x]))}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
        )}
        <button
          className="continue"
          onClick={() => (step === 1 ? continueFromStep1() : (location.href = '/'))}
          disabled={step === 1 ? !step1Ready || accountLoading : !selected.length}
        >
          {step === 1 && accountLoading ? 'Criando conta…' : 'Continuar →'}
        </button>
      </section>
    </main>
  );
}
