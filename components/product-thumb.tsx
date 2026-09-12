import { TOOLTIP_OPEN_PRODUCT } from '@/lib/format';

/**
 * Miniatura de produto. Só vira um link real (`<a target="_blank">`) quando
 * existe uma URL de produto REAL (`productUrl`, vinda de um campo genuíno da
 * API — nunca construída a partir do id, ver services/tiktok/adapters.ts).
 * Sem essa URL, permanece uma imagem estática: nunca inventamos um link
 * genérico para o clique não levar a lugar nenhum ou à página errada.
 */
export function ProductThumb({
  className,
  imageUrl,
  productUrl,
  fallback,
}: {
  className: string;
  imageUrl?: string;
  productUrl?: string;
  fallback: string;
}) {
  const content = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL externa da CDN da TikTok, domínio variável
    <img src={imageUrl} alt="" />
  ) : (
    fallback
  );
  if (productUrl) {
    return (
      <a className={className} href={productUrl} target="_blank" rel="noopener noreferrer" title={TOOLTIP_OPEN_PRODUCT}>
        {content}
      </a>
    );
  }
  return <span className={className}>{content}</span>;
}
