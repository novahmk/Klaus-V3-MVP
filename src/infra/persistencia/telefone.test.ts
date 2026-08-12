import { describe, expect, it } from 'vitest';

import { ValidacaoPersistenciaError } from './errors.js';
import { ehTelefoneValido, normalizarTelefone } from './telefone.js';

describe('normalizarTelefone', () => {
  it('remove máscara e mantém apenas dígitos', () => {
    expect(normalizarTelefone('+55 (11) 99999-8888')).toBe('5511999998888');
  });

  it('aceita telefone já normalizado', () => {
    expect(normalizarTelefone('5511999998888')).toBe('5511999998888');
  });

  it('produz a mesma chave para formatos diferentes do mesmo número', () => {
    expect(normalizarTelefone('  55 11 99999 8888 ')).toBe(normalizarTelefone('+5511999998888'));
  });

  it('rejeita número curto demais', () => {
    expect(() => normalizarTelefone('11999')).toThrow(ValidacaoPersistenciaError);
  });

  it('rejeita número longo demais', () => {
    expect(() => normalizarTelefone('1234567890123456')).toThrow(ValidacaoPersistenciaError);
  });

  it('rejeita string sem dígitos', () => {
    expect(() => normalizarTelefone('sem numero')).toThrow(ValidacaoPersistenciaError);
  });
});

describe('ehTelefoneValido', () => {
  it('confirma telefone válido', () => {
    expect(ehTelefoneValido('+55 11 99999-8888')).toBe(true);
  });

  it('recusa telefone inválido sem lançar', () => {
    expect(ehTelefoneValido('123')).toBe(false);
  });
});
