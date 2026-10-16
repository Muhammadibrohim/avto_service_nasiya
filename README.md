# AVTO SERVICE NASIYA

Avtoservislar uchun Telegram Mini App: mijozlar, avtomobillar, servislar va **nasiya (qarz) nazorati** bir joyda.

## Imkoniyatlar

- **Mijoz va avtomobil** — qo‘shish, tahrirlash, ism / telefon / davlat raqami bo‘yicha qidirish.
- **Servis (buyurtma)** — katalogdan bir bosishda ish va detal qo‘shish, boshlang‘ich to‘lov (naqd/karta/o‘tkazma), nasiya muddati (+3/+7/+14/+30 kun), probeg, izoh.
- **To‘lovlar** — bitta servisga yoki mijozning barcha qarziga (eskisidan boshlab avtomatik taqsimlanadi). Bir vaqtda kelgan ikki to‘lov qarzdan oshib ketmaydi.
- **Tuzatishlar** — narxlarni tahrirlash, xato to‘lovni o‘chirish, servisni bekor qilish (faqat ega/admin).
- **Qarzdorlar** — mijoz bo‘yicha guruhlangan, kechikkan va 7 kun ichida to‘lanadiganlar filtri.
- **Telegram eslatma** — har kuni ertalab ega va adminlarga muddati yaqin/o‘tgan qarzlar ro‘yxati.
- **Hisobotlar** — aylanma, tushum, nasiya, o‘rtacha chek, kunlik grafik, to‘lov turlari, top ishlar va qarzdorlar.
- **Katalog va ombor** — xizmat va detallar narxi, detal ishlatilganda qoldiq kamayadi, bekor qilinsa qaytadi.
- **Xodimlar** — taklif kodi orqali usta qo‘shish; rollar: `owner` (ega), `admin`, `staff` (usta).
- **Chek** — servis chekini Telegram orqali mijozga yuborish.

## Arxitektura

```
Telegram Mini App (React + Vite, Vercel)
        │  x-telegram-init-data (HMAC bilan tekshiriladi)
        ▼
Express 5 API (Render) ──► Prisma 7 ──► PostgreSQL (Neon)
        │
        └─► Telegram Bot API (menyu tugmasi, eslatmalar)
```

Ma’lumotlar modeli: `User → Member(role) → Workshop → Customer → Vehicle → ServiceOrder → OrderItem / Payment`, qo‘shimcha `Service`, `Part`, `Setting`.

## Rollar

| Amal | staff | admin | owner |
|---|:-:|:-:|:-:|
| Mijoz, avtomobil, servis, to‘lov qo‘shish | ✅ | ✅ | ✅ |
| Narxni tahrirlash, to‘lovni o‘chirish, servisni bekor qilish | — | ✅ | ✅ |
| Katalog, hisobotlar, ustaxona sozlamalari, xodim chiqarish | — | ✅ | ✅ |
| Admin tayinlash | — | — | ✅ |

## Lokal ishga tushirish

```bash
# backend
cd backend
cp .env.example .env        # DATABASE_URL va TELEGRAM_BOT_TOKEN ni to‘ldiring
npm install
npx prisma db push
npm run dev                 # http://localhost:3000
npm test                    # unit testlar

# frontend
cd frontend
npm install
VITE_API_URL=http://localhost:3000 npm run dev
```

Mini App faqat Telegram ichida ishlaydi (`initData` kerak). Lokal sinash uchun bot menyusidagi URL’ni vaqtincha tunnel (ngrok va h.k.) manziliga qo‘ying.

## Muhit o‘zgaruvchilari (backend)

| Nomi | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `TELEGRAM_BOT_TOKEN` | @BotFather tokeni |
| `FRONTEND_URL` | Frontend manzili (CORS), vergul bilan bir nechta |
| `TELEGRAM_MENU_URL` | Bot menyu tugmasi ochadigan manzil |
| `REMINDER_HOUR` | Eslatma soati (Toshkent vaqti), standart `9` |
| `REMINDERS_ENABLED` | `false` — ichki rejalashtiruvchini o‘chiradi |
| `CRON_SECRET` | `POST /api/cron/reminders` uchun maxfiy kalit |
| `TZ_OFFSET_MINUTES` | Biznes vaqt zonasi, standart `300` (UTC+5) |

### Eslatmalar Render bepul tarifida

Bepul tarifda server 15 daqiqa ishlatilmasa uxlab qoladi va ichki rejalashtiruvchi ishlamaydi. Shuning uchun [cron-job.org](https://cron-job.org) kabi xizmatda har kuni soat 09:05 ga so‘rov qo‘ying:

```
POST https://<render-manzil>/api/cron/reminders
Header: x-cron-secret: <CRON_SECRET>
```

Eslatma faqat botga `/start` yozgan foydalanuvchilarga yetib boradi.

## Ma’lumotlar bazasi o‘zgarishlari

Server ishga tushganda `prisma db push` bajariladi (`--accept-data-loss`siz). Shuning uchun sxemaga faqat **qo‘shimcha** o‘zgarishlar kiriting: yangi jadval, `?` (nullable) yoki `@default` bilan yangi ustun. Ma’lumot o‘chiriladigan o‘zgarish bo‘lsa deploy to‘xtaydi — bu ataylab qilingan himoya.

Eski versiyadan yangilanganda hech narsa qilish shart emas: mavjud ustaxona egasi birinchi kirishda avtomatik `owner` bo‘ladi.

## API qisqacha

`POST /api/auth/telegram`, `GET /api/me`, `POST /api/onboarding/workshop|join`,
`GET|POST|PATCH|DELETE /api/customers`, `POST /api/customers/:id/pay`,
`POST|PATCH|DELETE /api/vehicles`, `GET|POST|PATCH /api/orders`, `POST /api/orders/:id/cancel`,
`GET|POST|DELETE /api/payments`, `GET /api/debts`, `GET /api/dashboard`, `GET /api/reports`,
`GET|POST|PATCH|DELETE /api/services|parts`, `PATCH /api/workshop`, `POST /api/workshop/invite`,
`GET|PATCH|DELETE /api/members`, `POST /api/reminders/test`, `POST /api/cron/reminders`.
