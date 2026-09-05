import type { Metadata } from 'next';
import {
  Activity,
  BellRing,
  Compass,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'TikRadar — Inteligência e tendências para TikTok Shop',
  description:
    'Radar de tendências, análise de produtos e acompanhamento de criadores do TikTok Shop a partir de dados de provedores autorizados.',
};

const features = [
  {
    icon: <Compass size={18} />,
    title: 'Radar de tendências',
    text: 'Acompanhe o que está ganhando velocidade no TikTok Shop antes de virar concorrência.',
  },
  {
    icon: <Activity size={18} />,
    title: 'Análise de produtos',
    text: 'Preço, comissão, aceleração de vendas e saturação reunidos em um único indicador de oportunidade.',
  },
  {
    icon: <Users size={18} />,
    title: 'Acompanhamento de criadores',
    text: 'Veja quais criadores estão puxando vendas e como a base deles evolui ao longo do tempo.',
  },
  {
    icon: <Video size={18} />,
    title: 'Vídeos e lives',
    text: 'Relacione conteúdos e transmissões aos produtos que eles estão impulsionando.',
  },
  {
    icon: <BellRing size={18} />,
    title: 'Alertas de crescimento',
    text: 'Receba avisos dentro da plataforma quando um item cruza limiares relevantes de crescimento.',
  },
  {
    icon: <ScrollText size={18} />,
    title: 'Histórico de rankings',
    text: 'Snapshots periódicos preservam a evolução de posições para comparar 24h, 7 e 30 dias.',
  },
];

const steps = [
  {
    title: 'Coleta por provedores autorizados',
    text: 'Os dados chegam apenas por integrações e provedores autorizados, sem endpoints não oficiais.',
  },
  {
    title: 'Processamento dos indicadores',
    text: 'Aceleração, crescimento de GMV, entrada de criadores e saturação são normalizados de 0 a 100.',
  },
  {
    title: 'Apresentação de tendências e alertas',
    text: 'O resultado aparece como radar, rankings e alertas prontos para orientar decisões.',
  },
];

export default function LandingPage() {
  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-container">
          <a className="lp-brand" href="/">
            <span className="lp-brand-mark">
              <Sparkles size={16} />
            </span>
            TikRadar
          </a>
          <nav className="lp-nav">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#seguranca">Segurança</a>
            <a href="#contato">Contato</a>
          </nav>
          <div className="lp-header-actions">
            <a className="lp-btn" href="/login">
              Entrar
            </a>
            <a className="lp-btn lp-btn-primary" href="/dashboard">
              Acessar plataforma
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-container lp-hero-grid">
            <div>
              <p className="lp-eyebrow">INTELIGÊNCIA PARA TIKTOK SHOP</p>
              <h1>
                Enxergue as <em>tendências</em> do TikTok Shop antes do mercado.
              </h1>
              <p className="lp-lead">
                O TikRadar organiza sinais de crescimento — produtos, criadores, vídeos e lives — em
                indicadores claros de oportunidade e saturação, usando dados de provedores
                autorizados.
              </p>
              <div className="lp-hero-actions">
                <a className="lp-btn lp-btn-primary lp-btn-lg" href="/login">
                  Entrar no TikRadar
                </a>
                <a className="lp-btn lp-btn-lg" href="#como-funciona">
                  Como funciona
                </a>
              </div>
              <p className="lp-note">
                Plataforma em evolução. Os números exibidos são demonstrativos enquanto a integração
                oficial com o TikTok Shop não estiver aprovada — nada aqui deve ser tratado como dado
                oficial até então.
              </p>
            </div>

            <div className="lp-demo" aria-hidden="true">
              <div className="lp-demo-bar">
                <i />
                <i />
                <i />
                <span>TIKRADAR · VISÃO GERAL</span>
              </div>
              <div className="lp-demo-body">
                <div className="lp-demo-stats">
                  <div className="lp-demo-stat">
                    <b>R$ 4,2M</b>
                    <small>GMV analisado · 7 dias</small>
                  </div>
                  <div className="lp-demo-stat">
                    <b>128K</b>
                    <small>Vendas analisadas · 24h</small>
                  </div>
                  <div className="lp-demo-stat">
                    <b>37</b>
                    <small>Oportunidades · score ≥ 80</small>
                  </div>
                </div>
                <div className="lp-demo-chart" />
                <div className="lp-demo-rows">
                  <div className="lp-demo-row">
                    <span>Mini seladora portátil</span>
                    <b>↗ 212%</b>
                  </div>
                  <div className="lp-demo-row">
                    <span>Luminária touch recarregável</span>
                    <b>↗ 168%</b>
                  </div>
                  <div className="lp-demo-row">
                    <span>Sérum reparador noturno</span>
                    <b>↗ 94%</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="recursos">
          <div className="lp-container">
            <p className="lp-eyebrow">RECURSOS</p>
            <h2>Tudo o que move o TikTok Shop, em um só lugar</h2>
            <p className="lp-section-lead">
              Seis blocos de análise que transformam sinais dispersos em leitura de tendência.
            </p>
            <div className="lp-features">
              {features.map((f) => (
                <article className="lp-feature" key={f.title}>
                  <div className="lp-feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="como-funciona">
          <div className="lp-container">
            <p className="lp-eyebrow">COMO FUNCIONA</p>
            <h2>Do dado autorizado ao alerta</h2>
            <p className="lp-section-lead">
              Um fluxo direto, sem coleta não autorizada e sem inventar métricas que a fonte não
              fornece.
            </p>
            <div className="lp-steps">
              {steps.map((s) => (
                <article className="lp-step" key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="seguranca">
          <div className="lp-container">
            <p className="lp-eyebrow">SEGURANÇA</p>
            <h2>Segurança e privacidade desde o projeto</h2>
            <div className="lp-security-grid">
              <div>
                <ul className="lp-security-list">
                  <li>
                    <Lock size={18} />
                    <div>
                      <strong>HTTPS em todo o tráfego</strong>
                      <br />
                      <span>Transporte sempre cifrado, com cabeçalhos de segurança aplicados.</span>
                    </div>
                  </li>
                  <li>
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Controle de acesso</strong>
                      <br />
                      <span>
                        Sessão validada no servidor, papéis de usuário e área administrativa
                        separada.
                      </span>
                    </div>
                  </li>
                  <li>
                    <KeyRound size={18} />
                    <div>
                      <strong>Proteção de credenciais</strong>
                      <br />
                      <span>
                        Segredos e tokens ficam apenas no servidor; nunca são enviados ao navegador.
                      </span>
                    </div>
                  </li>
                  <li>
                    <ScrollText size={18} />
                    <div>
                      <strong>Política de privacidade</strong>
                      <br />
                      <span>
                        Tratamento de dados descrito em detalhe na{' '}
                        <a href="/privacy">Política de Privacidade</a>.
                      </span>
                    </div>
                  </li>
                </ul>
                <a className="lp-btn" href="/security">
                  Ver página de Segurança
                </a>
              </div>
              <aside className="lp-security-card">
                <p>
                  Os procedimentos de classificação de dados, criptografia, resposta a incidentes e
                  retenção são versionados junto ao projeto e revisados periodicamente. Solicitações
                  de dados e comunicações de incidente passam por um canal autenticado.
                </p>
              </aside>
            </div>
          </div>
        </section>

        <section className="lp-cta">
          <div className="lp-container">
            <h2>Pronto para acompanhar o próximo produto em alta?</h2>
            <a className="lp-btn lp-btn-primary lp-btn-lg" href="/login">
              Entrar no TikRadar
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer" id="contato">
        <div className="lp-container">
          <div className="lp-footer-top">
            <a className="lp-brand" href="/">
              <span className="lp-brand-mark">
                <Sparkles size={16} />
              </span>
              TikRadar
            </a>
            <nav className="lp-footer-links">
              <a href="/privacy">Política de Privacidade</a>
              <a href="/security">Segurança</a>
              <a href="/data-requests">Solicitações de Dados</a>
              <a href="/data-requests">Contato</a>
            </nav>
          </div>
          <div className="lp-footer-legal">
            <strong>Gabriela Eugenia de Oliveira Godoy</strong>
            <br />
            CNPJ 56.042.168/0001-14
            <br />
            TikRadar — inteligência de mercado para TikTok Shop.
          </div>
        </div>
      </footer>
    </div>
  );
}
