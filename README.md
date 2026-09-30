# San Cristóbal Car House

Sitio web y panel de administración de **San Cristóbal Car House**.

## Estructura

- `index.html`: sitio público / stock.
- `auto.html`: ficha individual de vehículo.
- `admin.html`: panel privado de inventario.
- `analytics.html`: estadísticas, publicaciones externas, ofertas recibidas e informes PDF.
- `vercel.json`: rewrites para Vercel.
- `supabase/functions/`: Edge Functions usadas por el proyecto.
- `supabase/migrations/`: esquema y políticas de la base.

## Backend

El proyecto usa Supabase para autenticación, base de datos, storage, analytics y Edge Functions.

La clave que aparece en el frontend es la **publishable key** de Supabase. Las credenciales privadas y service-role keys no se guardan en este repositorio; se leen desde variables de entorno de Supabase.

## Deploy

El frontend puede importarse directamente en Vercel desde este repositorio.

