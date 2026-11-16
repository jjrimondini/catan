// Punto d'ingresso dei bot: sceglie l'azione in base al livello.
import { botAction } from './easy.js';
import { strategicAction } from './strategy.js';

export { BOT_LEVELS } from '../../public/shared/constants.js';

export const BOT_NAMES = ['Vega', 'Orione', 'Lyra', 'Sirio', 'Altair', 'Nova', 'Rigel', 'Deneb'];

/**
 * @param view   vista privata del bot (privateView)
 * @param level  'easy' | 'medium' | 'hard'
 * @param memory oggetto persistente per bot (offerte fatte nel turno, ecc.); `memory.now` = istante attuale
 */
export function botDecide(view, level, memory = {}, r = Math.random) {
  if (level === 'easy') return botAction(view, r);
  return strategicAction(view, level, memory, r);
}
