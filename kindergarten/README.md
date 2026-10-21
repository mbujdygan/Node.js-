# Kindergarten API

REST API (Node.js + Express) для управління приватним дитячим садком: діти 2–5 років, групи, вихователі,
викладачі, розклад, оплата, пільги, прибуток, історія змін. Без frontend.

## База даних (PostgreSQL)
Дані зберігаються в PostgreSQL: сервер `localhost:5432`, база `kindergarten_local` (як у DBeaver).
```bash
createdb -U postgres kindergarten_local     # або створіть базу в DBeaver: ПКМ на «Бази даних» → Створити
npm install
npm start                                   # таблиці створюються автоматично зі db/schema.sql
```
Підключення (усе опційно, значення за замовчуванням):
`PGHOST=localhost PGPORT=5432 PGDATABASE=kindergarten_local PGUSER=postgres PGPASSWORD=postgres`
або одним рядком `DATABASE_URL=postgres://user:pass@host:5432/kindergarten_local`.

Таблиці: `users`, `staff`, `groups`, `children`, `settings`, `schedule`, `history`, `counters`.
Усі зміни пишуться однією транзакцією разом із записом в `history` (before/after). Відповідь на POST/PATCH/DELETE
йде лише після коміту; якщо запис у БД не вдався - клієнт отримує 500.
Без БД (як раніше): `npm run start:memory` (опційно `DATA_FILE=data.json`).

## Запуск
```bash
npm install
npm start                 # http://localhost:3000 (потрібен PostgreSQL, див. вище)
# опційно: PORT=4000 JWT_SECRET=... ADMIN_USER=admin ADMIN_PASSWORD=admin123 npm start
```
Дефолтний адмін: `admin` / `admin123` (створюється при першому запуску).

## Тести
```bash
npm test                  # jest + supertest + coverage (поріг 95%); БД не потрібна (використовується імітація пулу)
```

## Ролі
| Роль | Може |
|---|---|
| admin | все, включно з пільгами, налаштуваннями, /profit, /optimization, /history |
| manager | реєструвати батьків і дітей, групи, генерувати розклад (пільги не змінює) |
| parent | лише своя дитина: дані, розклад, розрахована оплата |
| teacher | розклад зі своєї точки зору, діти своєї групи (якщо вихователь) |

## Ендпоінти
`POST /auth/login` · `GET /auth/me` · `POST /managers` · `POST|GET /parents` · `POST|GET /staff`, `PATCH|DELETE /staff/:id`,
`GET /staff/:id/schedule` · `POST|GET /groups`, `PATCH|DELETE /groups/:id`, `POST /groups/:id/children`,
`DELETE /groups/:id/children/:childId` · `POST|GET /children`, `GET|PATCH|DELETE /children/:id`,
`GET /children/:id/billing?months=&plan=&workDays=`, `GET /children/:id/schedule` · `POST /schedule/generate`, `GET /schedule` ·
`GET /profit`, `GET /profit/groups/:id`, `GET /optimization` · `GET|PATCH /settings` · `GET /history?collection=&id=`

## Припущення (у ТЗ не визначено — змінюються через PATCH /settings)
- 22 робочі дні на місяць; пільга діє лише на навчання; знижка 12% за рік наперед застосовується після пільги.
- Харчування без знижок, собівартість = ціні (mealCostPercent=100), оренда кімнати = 0.
- Помічник і вихователь отримують 40 000 грн, менеджер 80 000 грн, предметники 40 000 грн (можна задати salary окремо).
- Вік = повні роки; група має фіксований вік (2–5), ліміт 30 дітей.
- День 08:00–16:00: сніданок 08:00, обід 12:00, полуденок 14:30, сон 12:30–13:30, 5 занять по 30 хв щодня.
- НЕ визначено в ТЗ: тимчасова пауза відвідування — не реалізовано, потрібне уточнення.
