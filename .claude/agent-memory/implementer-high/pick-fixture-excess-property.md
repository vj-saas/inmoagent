---
name: pick-fixture-excess-property
description: Para testear utils tipados con Pick<Lead, 'campo'> demostrando que otros campos NO influyen, usar un fixture tipado, no un literal inline
metadata:
  type: feedback
---

Cuando un util puro recibe `Pick<Lead, 'x'>` y el test quiere probar que otro
campo (ej. `fOperation`) NO participa del cálculo, el objeto de prueba debe
construirse con una factory tipada como `Pick<Lead, 'x' | 'otroCampo'>` y
pasarse por variable.

**Why:** un literal inline con propiedades extra dispara el excess property
check de TS y el spec no compila; caer en `as any` para esquivarlo tapa
errores reales de tipo en tests de superficie crítica (FSM).

**How to apply:** en specs de `src/conversation/*.util.spec.ts` (ver
`release-state.util.spec.ts` y `filters.util.spec.ts`), definir
`function lead(overrides: Partial<Fixture> = {}): Fixture` con defaults y
spread. Sirve además para el caso "select parcial": `{} as Pick<Lead,'x'>`
verifica el degradado defensivo sin romper tipos.
Relacionado: [[composite-guard-e2e]].
