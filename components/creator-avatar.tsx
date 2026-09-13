/**
 * Avatar de criador. Mostra a foto de perfil real (`imageUrl`, vinda de um
 * campo genuíno da API — ver `avatarUrlFrom` em services/tiktok/adapters.ts)
 * quando ela existir; caso contrário, iniciais neutras sobre um círculo —
 * nunca uma foto inventada ou de outro criador. A URL, quando existir, é
 * usada diretamente (mesma CDN de imagem já usada em `ProductThumb`, sem
 * necessidade de assinatura/proxy).
 */
export function CreatorAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string; className: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- URL externa da CDN da TikTok, domínio variável
    return <img className={className} src={imageUrl} alt="" />;
  }
  return <span className={className}>{initialsOf(name)}</span>;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
