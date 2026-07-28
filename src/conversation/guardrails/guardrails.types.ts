export type GuardrailAction =
  | { type: 'opt_out' }
  | { type: 'handoff' }
  | { type: 'silenced' }
  | { type: 'handoff_timeout_release' }
  /** Sesión inactiva por tiempo real (spec 10): el lead vuelve a escribir
   * tras el umbral de inactividad y hay que resetear filtros/calificación
   * comercial antes de seguir (nunca lo decide el LLM). */
  | { type: 'session_expired' }
  | { type: 'continue' };
