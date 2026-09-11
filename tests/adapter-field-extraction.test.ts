import { describe, it, expect } from 'vitest';
import { TikTokBestsellersAdapter } from '@/services/tiktok/adapters';

// Formato real observado na primeira sincronização com a TikTok Shop —
// snake_case (nick_name/user_name/followers_count), diferente do que o
// adapter checava antes (nickname/username). Regressão para o bug corrigido
// em services/tiktok/adapters.ts.
describe('TikTokBestsellersAdapter — campos reais da API', () => {
  const adapter = new TikTokBestsellersAdapter();

  it('extrai nome, username e seguidores de creators (nick_name/user_name/followers_count)', () => {
    const [creator] = adapter.normalize(
      'creators',
      {
        code: 0,
        message: 'success',
        data: {
          creators: [
            {
              rank: 1,
              open_id: 'uL2FuAAAAABGazmR1zjLBLLmtvglCslXKGMjKw4uBQfEtXfp23FS9Q',
              gmv_range: 'BRL2689477.32~BRL4565887.24',
              nick_name: 'mind bridge',
              user_name: 'aimarxbr2',
              likes_count: 3,
              followers_count: 40123,
            },
          ],
        },
      },
      'LOCAL',
    );

    expect(creator.name).toBe('mind bridge');
    expect(creator.username).toBe('aimarxbr2');
    expect(creator.followersCount).toBe(40123);
    expect(creator.gmv.gmvMin).toBeCloseTo(2689477.32);
  });

  it('extrai product_id/rank/id de vídeos e não quebra sem creator_id', () => {
    const [video] = adapter.normalize(
      'videos',
      {
        code: 0,
        message: 'success',
        data: {
          videos: [
            {
              id: '7681045521795927317',
              rank: 1,
              likes: 29376,
              views: 1669938,
              shares: 2267,
              comments: 421,
              gmv_range: 'BRL113422.17~BRL237891.35',
              nick_name: 'Thaís Rodrigues | CREATOR SHOP',
              publish_time: 1788382779,
              product_infos: [{ product_id: '1737256358606898667', product_name: 'Produto X' }],
            },
          ],
        },
      },
      'LOCAL',
    );

    expect(video.externalId).toBe('7681045521795927317');
    expect(video.productExternalId).toBe('1737256358606898667');
    expect(video.creatorExternalId).toBeUndefined(); // API não retorna id do criador no vídeo
    expect(video.views).toBe(1669938);
  });
});
