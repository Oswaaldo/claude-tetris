---
name: clima-gdl
description: Consulta el clima actual y el pronóstico para Guadalajara, Jalisco, México. Úsala cuando el usuario pregunte por "el clima", "el tiempo", "clima en Guadalajara/GDL", "¿va a llover?", "¿hace frío/calor?", o invoque /clima-gdl. Responde siempre en español con datos en tiempo real.
---

# Clima Guadalajara

Skill para reportar el clima actual y el pronóstico de Guadalajara, Jalisco, México, usando datos en tiempo real de la API pública de Open-Meteo (gratuita, sin API key).

## Cuándo usar esta skill

- El usuario pregunta por el clima/tiempo de Guadalajara, GDL, Jalisco, o simplemente "mi ciudad" (asumiendo que ya sabemos que vive en Guadalajara).
- Preguntas tipo "¿necesito llevar paraguas?", "¿hace frío hoy?", "¿cómo va a estar el fin de semana?".
- Invocación explícita con `/clima-gdl`.

## Ubicación fija

Guadalajara, Jalisco, México:
- Latitud: `20.6597`
- Longitud: `-103.3496`
- Zona horaria: `America/Mexico_City`

## Cómo obtener los datos

Usa la herramienta `WebFetch` (o `Bash` con `curl` si `WebFetch` no está disponible) contra la API de **Open-Meteo**, que no requiere autenticación:

```
https://api.open-meteo.com/v1/forecast?latitude=20.6597&longitude=-103.3496&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FMexico_City&forecast_days=3&wind_speed_unit=kmh
```

Si usas `curl` vía Bash:

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=20.6597&longitude=-103.3496&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FMexico_City&forecast_days=3&wind_speed_unit=kmh"
```

### Fallback

Si Open-Meteo no responde, usa como respaldo:

```bash
curl -s "https://wttr.in/Guadalajara?lang=es&format=3"
```

(da una línea de texto rápida; úsala solo si la API principal falla).

## Interpretar `weather_code` (código WMO)

Traduce el código numérico a una descripción en español:

| Código | Descripción |
|---|---|
| 0 | Cielo despejado |
| 1, 2, 3 | Parcialmente nublado / mayormente nublado |
| 45, 48 | Niebla |
| 51, 53, 55 | Llovizna (ligera/moderada/densa) |
| 61, 63, 65 | Lluvia (ligera/moderada/fuerte) |
| 66, 67 | Lluvia helada |
| 71, 73, 75 | Nieve (ligera/moderada/fuerte) |
| 80, 81, 82 | Chubascos (ligeros/moderados/violentos) |
| 95 | Tormenta eléctrica |
| 96, 99 | Tormenta eléctrica con granizo |

## Formato de respuesta

Responde siempre en español, de forma breve y clara. Incluye:

1. **Ahora**: temperatura actual, sensación térmica, condición (traducida de `weather_code`), humedad y viento.
2. **Próximos días**: máxima/mínima y probabilidad de lluvia para hoy, mañana y pasado mañana, usando el bloque `daily`.
3. Un comentario práctico y corto si aplica (ej. "lleva paraguas", "hace fresco, lleva chamarra").

### Ejemplo de salida

```
Clima en Guadalajara, Jalisco ahora mismo:
🌡️ 24°C (sensación 25°C) — Parcialmente nublado
💧 Humedad: 45% | 💨 Viento: 12 km/h

Pronóstico:
- Hoy: 26° / 15°C, 10% prob. de lluvia
- Mañana: 27° / 16°C, 20% prob. de lluvia
- Pasado mañana: 25° / 16°C, 40% prob. de lluvia — quizá lleves paraguas por la tarde.
```

## Notas

- No necesitas API key ni configuración adicional; Open-Meteo es pública y gratuita.
- Si el usuario pide el clima de otra ciudad, puedes seguir el mismo patrón cambiando `latitude`/`longitude`, pero esta skill está calibrada para Guadalajara por defecto.
- Esta skill es de nivel de proyecto (vive en `.claude/skills/clima-gdl/`), por lo que solo está disponible en este repositorio. Si el usuario quiere usarla desde cualquier proyecto, sugiere copiarla a `~/.claude/skills/clima-gdl/`.
