export type GuardrailAction =
  | { type: 'opt_out' }
  | { type: 'handoff' }
  | { type: 'silenced' }
  | { type: 'handoff_timeout_release' }
  | { type: 'continue' };
