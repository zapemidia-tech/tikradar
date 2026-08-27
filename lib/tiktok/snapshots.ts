export function appendSnapshot<T>(history:readonly T[],snapshot:T):T[]{return[...history,snapshot]}
