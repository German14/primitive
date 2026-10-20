# Primitive · Quiniela

Angular 22 · predicciones 1X2 con mock y APIs intercambiables.

    npm install && npm start

## Pasar de mock a APIs reales
1. `src/environments/environment.ts` → `useMock: false` y rellena URLs/claves.
2. `src/app/services/http/http-apis.ts` → adapta cada `map()` al JSON de tu API (marcado con TODO).
3. El clima (Open-Meteo) ya funciona sin clave.

Corrupción y economía son valores manuales (-1..1) en `MockFactorsApi`; no existe fuente pública fiable.
Pesos del modelo: `src/app/prediction/model.ts`.
