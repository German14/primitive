# Primitive · Quiniela

Angular 22 · predicciones 1X2 con mock y APIs intercambiables.

    npm install && npm start

## Pasar de mock a APIs reales
1. `src/environments/environment.ts` → `useMock: false` y rellena URLs/claves.
2. `src/app/services/http/http-apis.ts` → adapta cada `map()` al JSON de tu API (marcado con TODO).
3. El clima (Open-Meteo) ya funciona sin clave.

Corrupción y economía son valores manuales (-1..1) en `MockFactorsApi`; no existe fuente pública fiable.
Pesos del modelo: `src/app/prediction/model.ts`.

## Boleto oficial de La Quiniela
La fuente activa se configura como `quiniela` en `src/environments/environment.ts`. Carga los 15 partidos desde `https://api.eduardolosilla.es/escrutinios`, con los valores iniciales `jornada: 16` y `temporada: 2027`; ambos pueden cambiarse en los controles de la aplicación. La respuesta incluye la jornada ordenada del 1 al 15 y se valida antes de presentarla.

Esta fuente aporta los 15 partidos y horarios. La app los complementa con historial de goles (football-data.org para Primera y API-Football donde haya cobertura), clima por ciudad (Open-Meteo) y tarjetas de jugadores de la temporada (API-Football), siempre que las APIs tengan datos para esa división. Si no hay historial de goles disponible, muestra probabilidades neutrales y deja el signo sin seleccionar en vez de presentar un resultado inventado.

Para el historial de Primera configura `FOOTBALL_DATA_TOKEN`; para el clima no hace falta clave; para las estadísticas por jugador y resultados de otras divisiones configura `API_FOOTBALL_KEY`. Configúralas como variables de entorno antes de arrancar Angular; no las escribas en `environment.ts`. Ejemplo en PowerShell:

```powershell
$env:FOOTBALL_DATA_TOKEN = "tu_token"
$env:API_FOOTBALL_KEY = "tu_clave"
npm start
```

Las consultas de API-Football se serializan para reducir los 429 y se cachean en el navegador. El proveedor puede imponer límites diarios o de plan que esta aplicación no puede evitar; la carga de tarjetas de una plantilla puede tardar un poco. Solo se muestran estadísticas disponibles antes del partido futuro.

## Tarjetas (API-Football)
Las estadísticas por jugador se consultan en API-Football (API-SPORTS), usando la temporada y competición de cada partido. El resumen del equipo se calcula desde los datos de los jugadores y se muestran los tres con más tarjetas:

```powershell
$env:API_FOOTBALL_KEY = "tu_clave"
npm start
```

El plan de API-Football debe permitir consultas de equipos, plantillas, jugadores y partidos. Para partidos pasados no se reutilizan las estadísticas actuales de temporada. Las amarillas y rojas de los jugadores contribuyen al riesgo agregado del equipo; no se consultan convocatorias ni sanciones oficiales, por lo que no se puede asegurar qué jugador jugará o estará suspendido.
