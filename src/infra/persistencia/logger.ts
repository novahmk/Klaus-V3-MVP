import { COMPONENT_NAME } from './constants.js';
import type { Logger } from './types.js';

export function criarLoggerPadrao(): Logger {
  return {
    info(message, meta) {
      console.log(JSON.stringify({ level: 'info', component: COMPONENT_NAME, message, ...meta }));
    },
    warn(message, meta) {
      console.warn(JSON.stringify({ level: 'warn', component: COMPONENT_NAME, message, ...meta }));
    },
    error(message, meta) {
      console.error(JSON.stringify({ level: 'error', component: COMPONENT_NAME, message, ...meta }));
    },
    debug(message, meta) {
      console.debug(JSON.stringify({ level: 'debug', component: COMPONENT_NAME, message, ...meta }));
    },
  };
}
