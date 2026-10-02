import { describe, it, expect } from 'vitest';
import { createOAuthState, isOAuthStateExpired, diagnoseCallback } from '@/lib/tiktok/oauth-state';

// Módulo compartilhado pelos fluxos OAuth de seller E criador (ver
// app/api/tiktok/creator/oauth/callback/route.ts) — sem teste até agora.
// Cobre os requisitos da Seção 12 do pedido de "Minha conta de afiliado":
// state válido, ausente, divergente e expirado; código ausente.

describe('createOAuthState / isOAuthStateExpired', () => {
  it('gera um state com instante de emissão embutido, nunca expirado na hora', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    const state = createOAuthState(now);
    expect(isOAuthStateExpired(state, now)).toBe(false);
  });

  it('expira depois do maxAge (10 min por padrão)', () => {
    const issuedAt = new Date('2026-09-30T12:00:00Z');
    const state = createOAuthState(issuedAt);
    const later = new Date('2026-09-30T12:11:00Z'); // 11 min depois
    expect(isOAuthStateExpired(state, later)).toBe(true);
  });

  it('não expira 1s antes do limite exato', () => {
    const issuedAt = new Date('2026-09-30T12:00:00Z');
    const state = createOAuthState(issuedAt);
    const almostExpired = new Date('2026-09-30T12:09:59Z');
    expect(isOAuthStateExpired(state, almostExpired)).toBe(false);
  });

  it('formato irreconhecível conta como expirado — nunca aceito por engano', () => {
    expect(isOAuthStateExpired('formato-invalido-sem-timestamp')).toBe(true);
    expect(isOAuthStateExpired('')).toBe(true);
  });
});

describe('diagnoseCallback — state válido/ausente/divergente/expirado, código ausente', () => {
  const now = new Date('2026-09-30T12:00:00Z');

  it('null quando code+state+cookie batem e dentro da validade', () => {
    const state = createOAuthState(now);
    expect(diagnoseCallback({ code: 'abc', state, expectedFromCookie: state, now })).toBeNull();
  });

  it('state_missing quando não há cookie (state iniciado em outro navegador/aba, ou bloqueado)', () => {
    const state = createOAuthState(now);
    expect(diagnoseCallback({ code: 'abc', state, expectedFromCookie: null, now })).toBe('state_missing');
  });

  it('state_invalid quando o state da URL diverge do cookie', () => {
    const cookieState = createOAuthState(now);
    expect(diagnoseCallback({ code: 'abc', state: 'outro-state-qualquer', expectedFromCookie: cookieState, now })).toBe('state_invalid');
  });

  it('state_invalid quando a URL não traz state nenhum', () => {
    const cookieState = createOAuthState(now);
    expect(diagnoseCallback({ code: 'abc', state: null, expectedFromCookie: cookieState, now })).toBe('state_invalid');
  });

  it('state_expired quando o state bate mas já passou da validade', () => {
    const issuedAt = new Date('2026-09-30T11:00:00Z');
    const state = createOAuthState(issuedAt);
    expect(diagnoseCallback({ code: 'abc', state, expectedFromCookie: state, now })).toBe('state_expired');
  });

  it('no_code quando state bate, dentro da validade, mas falta o código', () => {
    const state = createOAuthState(now);
    expect(diagnoseCallback({ code: null, state, expectedFromCookie: state, now })).toBe('no_code');
  });

  it('checa state ANTES de checar o código — nunca reporta "código ausente" quando o motivo real é state inválido', () => {
    const cookieState = createOAuthState(now);
    const result = diagnoseCallback({ code: null, state: 'state-errado', expectedFromCookie: cookieState, now });
    expect(result).toBe('state_invalid');
  });
});
