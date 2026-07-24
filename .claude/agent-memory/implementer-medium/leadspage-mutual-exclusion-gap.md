---
name: leadspage-mutual-exclusion-gap
description: Al revisar cobertura de pantallas orquestadoras (loading/error/vacío/datos), suele faltar probar el caso de éxito ocultando el resto y el caso "cambiar un campo no resetea otro"
metadata:
  type: feedback
---

Al auditar tests ya escritos por otro implementer para una pantalla que combina
varios estados mutuamente excluyentes (spinner/error/vacío/datos), es común que
cada estado negativo esté probado de forma aislada pero falten dos casos:

1. El estado de éxito (datos con resultados) verificando explícitamente que
   spinner/error/mensaje-vacío NO están presentes al mismo tiempo (no basta con
   que el código tenga ifs mutuamente excluyentes — hay que testearlo).
2. El caso negativo de un reset condicional: si la spec dice "resetea X al
   cambiar A o B, pero nunca al cambiar solo C", suele faltar el test que
   cambia C y verifica que X NO se resetea (ej. cambiar de página no debe
   volver a page=1, debe preservar filtro/búsqueda vigentes).

**Por qué:** encontrado en A3-bandeja-leads T15 (LeadsPage: loading/error/vacío
sí testeados, pero faltaba el "todo ok" y el "page change preserva filtro").

**Cómo aplicar:** al revisar (no reescribir) tests de una pantalla
orquestadora, buscar explícitamente estos dos huecos antes de dar por
completa la cobertura, en vez de asumir que los tests existentes ya los cubren
implícitamente.
