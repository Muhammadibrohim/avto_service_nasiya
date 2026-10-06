# AVTO SERVICE NASIYA

Telegram Mini App for automotive service management.

## Architecture
Telegram Mini App → Vercel → Render API → Neon PostgreSQL → Prisma

## DB architecture
The domain follows the same structural principles as HR Mini App:
User → Workshop → Customer → Vehicle → ServiceOrder → OrderItem / Payment

Additional shared models:
Notification, Setting

## Roles
owner / admin / staff

## Next stages
Telegram authentication → API → frontend integration → tests → deployment → migration → production.