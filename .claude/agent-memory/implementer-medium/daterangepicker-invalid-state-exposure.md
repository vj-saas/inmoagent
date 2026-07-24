---
name: daterangepicker-invalid-state-exposure
description: DateRangePicker (A.5/T3) expone estado inválido vía atributo DOM data-valid, no vía callback onInvalid separado
metadata:
  type: project
---

`DateRangePicker.tsx` (`frontend/src/components/dashboard/`) valida
`fromDay <= toDay` (orden lexicográfico de `YYYY-MM-DD`) y NO invoca `onChange`
cuando es inválido. Para exponer ese estado al padre elegí un atributo DOM
(`data-valid` en el contenedor `data-testid="date-range-picker"`) en vez de un
callback `onInvalid()` separado, porque la spec (T3 de A.5) dejaba la elección
abierta y esto minimiza la superficie de props.

**Por qué puede no alcanzar:** si `DashboardPage` (T4) necesita el booleano de
validez en JS (para decidir el render, no solo en un test), leer un atributo
DOM del hijo no es idiomático en React — lo más limpio sería que T4 mantenga su
propio `fromDay`/`toDay` (o reciba una prop `onValidityChange`/`onInvalid`) en
vez de inspeccionar el DOM del picker.

**Cómo aplicar:** si al implementar T4 el patrón de lectura de `data-valid`
resulta incómodo, es válido agregar una prop `onValidityChange(isValid: boolean)`
al picker sin romper `onChange` — avisar antes de asumir cuál prefiere el
usuario si ya se implementó T4 con el DOM y funciona.
