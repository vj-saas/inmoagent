---
name: propertyform-t13-field-error-mapping
description: PropertyForm.tsx (T13, V-D-portal-propiedades) mapea 400/409 del backend a error de campo por substring del mensaje, sin reescribirlo
metadata:
  type: project
---

`PropertyForm.tsx` es un solo componente para alta (`createProperty`) y edición
(`updateProperty`, PATCH parcial vía `Set<FieldName>` de campos tocados —
mismo patrón que [[tenantconfigform-partial-patch-preview]]). `ConflictError`
y `ValidationError` NO se re-exportan desde `api/endpoints.ts`: hay que
importarlos directo de `api/http-client.ts` (a diferencia de otros mocks del
proyecto que asumían que venían de `endpoints.ts`).

Mapeo de campo: como el backend devuelve un único string de mensaje (no un
array estructurado por campo en la superficie que usa el frontend), se ubica
el error en `price`/`photoUrls`/`externalRef` buscando esas substrings
(en minúsculas) dentro del mensaje crudo, sin reescribirlo (AC-5/AC-6). Si no
matchea ningún campo conocido, cae a error general del formulario
(`ErrorBanner`).

**Por qué:** evita inventar un contrato de error estructurado que el backend
no expone, y mantiene el texto exacto que ve el usuario.

**Cómo aplicar:** si `properties-admin.service.ts` cambia los mensajes de
validación/conflicto (ej. deja de mencionar el nombre del campo en inglés tal
cual class-validator), este mapeo por substring se rompe silenciosamente —
revisar `mapBackendMessageToFieldErrors` si el AC-5/AC-6 falla en integración
(`T18` E2E 2/3/4).

`PhotoListEditor` (T12) tiene su propio `<form>` interno para "Agregar URL",
lo que genera un warning de DOM anidado (`<form>` dentro de `<form>`) al
embeberlo en `PropertyForm`. Es solo warning de consola, no rompe tests; no se
tocó `PhotoListEditor` porque no es responsabilidad de T13.
