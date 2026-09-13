import { describe, it, expect } from 'vitest';
import { TikTokBestsellersAdapter } from '@/services/tiktok/adapters';
import { brl, gmvRange, parsePeriodParam, PERIOD_LABEL } from '@/lib/format';
import { TikTokShopProvider } from '@/lib/providers/tiktok-shop-provider';

// Formato real observado em creator_snapshots (500 linhas inspecionadas em
// 2026-09-12, ver services/tiktok/adapters.ts e supabase/migrations/
// 008_creator_avatar.sql): nunca traz um campo de foto de perfil.
const REAL_CREATOR_ITEM = {
  rank: 69,
  open_id: 'liqAiAAAAABGazmR1zjLBLLmtvglCslXfq_bewebatCPHC4vL687qA',
  gmv_range: 'BRL185549.01~BRL374575.33',
  nick_name: 'Cintia Pessoa',
  user_name: 'cintiapeople',
  likes_count: 317290,
  followers_count: 15382,
};

function envelope(creators: unknown[]) {
  return { code: 0, message: 'success', data: { creators } };
}

describe('TikTokBestsellersAdapter — avatar de criador', () => {
  const adapter = new TikTokBestsellersAdapter();

  it('avatar ausente: payload real de creators (sem campo de foto) não inventa imageUrl', () => {
    const [creator] = adapter.normalize('creators', envelope([REAL_CREATOR_ITEM]), 'LOCAL');
    expect(creator.imageUrl).toBeUndefined();
  });

  it('avatar presente: mapeia quando um campo de foto real aparecer no payload (ex.: avatar_url)', () => {
    const [creator] = adapter.normalize(
      'creators',
      envelope([{ ...REAL_CREATOR_ITEM, avatar_url: 'https://p16-oec-sg.ibyteimg.com/avatar123~tplv.jpeg' }]),
      'LOCAL',
    );
    expect(creator.imageUrl).toBe('https://p16-oec-sg.ibyteimg.com/avatar123~tplv.jpeg');
  });

  it('avatar ausente permanece ausente mesmo com outros campos de imagem não relacionados (product_image é só de produtos)', () => {
    const [creator] = adapter.normalize('creators', envelope([{ ...REAL_CREATOR_ITEM, product_image: { urls: ['https://x/y.jpg'] } }]), 'LOCAL');
    // product_image nunca existe de verdade num item de creators (é campo de products) — mesmo que existisse,
    // avatarUrlFrom não olha esse campo, só candidatos de avatar de fato.
    expect(creator.imageUrl).toBeUndefined();
  });
});

describe('lib/format — faixa de GMV', () => {
  it('formata a faixa quando min e max existem', () => {
    expect(gmvRange(185549.01, 374575.33)).toContain('–');
    expect(gmvRange(1000, 2000)).toBe(`${brl(1000)} – ${brl(2000)}`);
  });

  it('nunca inventa uma faixa quando falta um dos limites', () => {
    expect(gmvRange(null, 2000)).toBe('Não informado');
    expect(gmvRange(1000, null)).toBe('Não informado');
    expect(gmvRange(undefined, undefined)).toBe('Não informado');
  });
});

describe('lib/format — período (?period= da URL)', () => {
  it('aceita os 3 períodos suportados', () => {
    expect(parsePeriodParam('1D')).toBe('1D');
    expect(parsePeriodParam('7D')).toBe('7D');
    expect(parsePeriodParam('30D')).toBe('30D');
  });

  it('cai no padrão 7D para valor ausente, inválido ou array', () => {
    expect(parsePeriodParam(undefined)).toBe('7D');
    expect(parsePeriodParam('1h')).toBe('7D');
    expect(parsePeriodParam(['1D', '30D'])).toBe('1D'); // usa o primeiro valor válido da lista
    expect(parsePeriodParam(['bogus'])).toBe('7D');
  });

  it('PERIOD_LABEL cobre os 3 períodos em pt-BR', () => {
    expect(PERIOD_LABEL['1D']).toBe('1 dia');
    expect(PERIOD_LABEL['7D']).toBe('7 dias');
    expect(PERIOD_LABEL['30D']).toBe('30 dias');
  });
});

// --- TikTokShopProvider.getCreators(): stub mínimo do client Supabase -----
// Reaproveita a mesma disciplina de "não tocar rede" dos outros testes: só
// simula a forma da resposta do PostgREST (select/eq/order/limit thenable),
// nunca chama o Supabase de verdade.
function fakeSupabaseClient(tables: Record<string, { data: unknown[]; error: null }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  };
}

function makeProvider(tables: Record<string, { data: unknown[]; error: null }>) {
  const provider = new TikTokShopProvider({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'dummy-key-not-used-network',
  });
  // `client` é privado só em tempo de compilação — substituí-lo por um stub
  // é a forma mais simples de testar o mapeamento sem mockar o módulo
  // inteiro do @supabase/supabase-js.
  (provider as unknown as { client: unknown }).client = fakeSupabaseClient(tables);
  return provider;
}

describe('TikTokShopProvider.getCreators — mapeamento, deduplicação e ausência de vínculo com produto', () => {
  it('deduplicação: 2 snapshots do mesmo creator_id colapsam num único Creator, usando o mais recente', async () => {
    const provider = makeProvider({
      creators: { data: [{ id: 'c1', name: 'Cintia Pessoa', username: 'cintiapeople', followers: 15382, avatar_url: null }], error: null },
      creator_snapshots: {
        data: [
          { creator_id: 'c1', captured_at: '2026-09-10T00:00:00Z', ranking: 80, period: '7D', sales: null, gmv_min: 100000, gmv_max: 200000, gmv_estimated: 150000, video_count: 5 },
          { creator_id: 'c1', captured_at: '2026-09-11T00:00:00Z', ranking: 69, period: '7D', sales: null, gmv_min: 185549.01, gmv_max: 374575.33, gmv_estimated: 280062.17, video_count: 6 },
        ],
        error: null,
      },
    });

    const result = await provider.getCreators('7D');
    expect(result).toHaveLength(1); // não duplica o mesmo criador
    expect(result[0].ranking).toBe(69); // snapshot mais recente, não o primeiro
    expect(result[0].gmvRangeMin).toBeCloseTo(185549.01);
    expect(result[0].gmvRangeMax).toBeCloseTo(374575.33);
  });

  it('avatar presente na tabela creators é repassado como imageUrl', async () => {
    const provider = makeProvider({
      creators: { data: [{ id: 'c1', name: 'Com Foto', username: 'comfoto', followers: 100, avatar_url: 'https://cdn/avatar.jpg' }], error: null },
      creator_snapshots: {
        data: [{ creator_id: 'c1', captured_at: '2026-09-11T00:00:00Z', ranking: 1, period: '7D', sales: null, gmv_min: 1, gmv_max: 2, gmv_estimated: 1.5, video_count: 1 }],
        error: null,
      },
    });
    const [creator] = await provider.getCreators('7D');
    expect(creator.imageUrl).toBe('https://cdn/avatar.jpg');
  });

  it('avatar ausente na tabela creators mantém imageUrl undefined (nunca um placeholder inventado)', async () => {
    const provider = makeProvider({
      creators: { data: [{ id: 'c1', name: 'Sem Foto', username: 'semfoto', followers: 100, avatar_url: null }], error: null },
      creator_snapshots: {
        data: [{ creator_id: 'c1', captured_at: '2026-09-11T00:00:00Z', ranking: 1, period: '7D', sales: null, gmv_min: 1, gmv_max: 2, gmv_estimated: 1.5, video_count: 1 }],
        error: null,
      },
    });
    const [creator] = await provider.getCreators('7D');
    expect(creator.imageUrl).toBeUndefined();
  });

  it('períodos: o período do snapshot mais recente é repassado tal como veio (1D/7D/30D)', async () => {
    const provider = makeProvider({
      creators: { data: [{ id: 'c1', name: 'Criador 30D', username: 'c30', followers: 10, avatar_url: null }], error: null },
      creator_snapshots: {
        data: [{ creator_id: 'c1', captured_at: '2026-09-11T00:00:00Z', ranking: 5, period: '30D', sales: null, gmv_min: 10, gmv_max: 20, gmv_estimated: 15, video_count: 2 }],
        error: null,
      },
    });
    const [creator] = await provider.getCreators('30D');
    expect(creator.period).toBe('30D');
  });

  it('sem snapshot no período pedido: o criador não aparece (nunca mostrado com dado inventado)', async () => {
    const provider = makeProvider({
      creators: { data: [{ id: 'c1', name: 'Só tem 7D', username: 'so7d', followers: 10, avatar_url: null }], error: null },
      creator_snapshots: { data: [], error: null }, // simula período '1D' ainda não sincronizado
    });
    const result = await provider.getCreators('1D');
    expect(result).toHaveLength(0);
  });

  it('ausência de vínculo com produto: `products` é sempre null, mesmo com múltiplos criadores/snapshots', async () => {
    const provider = makeProvider({
      creators: {
        data: [
          { id: 'c1', name: 'A', username: 'a', followers: 1, avatar_url: null },
          { id: 'c2', name: 'B', username: 'b', followers: 2, avatar_url: null },
        ],
        error: null,
      },
      creator_snapshots: {
        data: [
          { creator_id: 'c1', captured_at: '2026-09-11T00:00:00Z', ranking: 1, period: '7D', sales: null, gmv_min: 1, gmv_max: 2, gmv_estimated: 1.5, video_count: 1 },
          { creator_id: 'c2', captured_at: '2026-09-11T00:00:00Z', ranking: 2, period: '7D', sales: null, gmv_min: 3, gmv_max: 4, gmv_estimated: 3.5, video_count: 2 },
        ],
        error: null,
      },
    });
    const result = await provider.getCreators('7D');
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.products === null)).toBe(true);
  });
});
