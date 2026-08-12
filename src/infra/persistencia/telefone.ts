import { TELEFONE_MAX_DIGITOS, TELEFONE_MIN_DIGITOS } from './constants.js';
import { ValidacaoPersistenciaError } from './errors.js';

/**
 * Reduz o telefone aos dígitos. O telefone é a chave de negócio usada para
 * localizar o lead — nunca a chave primária de `mensagens`, que é UUID.
 */
export function normalizarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '');

  if (digitos.length < TELEFONE_MIN_DIGITOS || digitos.length > TELEFONE_MAX_DIGITOS) {
    throw new ValidacaoPersistenciaError(
      `Telefone inválido: "${valor}" resultou em ${digitos.length} dígitos ` +
        `(esperado entre ${TELEFONE_MIN_DIGITOS} e ${TELEFONE_MAX_DIGITOS}).`,
    );
  }

  return digitos;
}

export function ehTelefoneValido(valor: string): boolean {
  try {
    normalizarTelefone(valor);
    return true;
  } catch {
    return false;
  }
}
