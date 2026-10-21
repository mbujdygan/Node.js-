# ᛒᚨᚱᚾᚨᚷᚨᚱᚦᚱ — Saga af Barnagarði
### Сага про Дитячий Садок

> *Звіт про виконану роботу у форматі давньонорвезької саги (з українським перекладом під кожною главою).*
> **Команда:** `Node.js` (Буждиган Михайло, Дацьо Діана, Вербіцький Євген,Галас Анна-Софія, Поп'юк Денис, Дашковський Андрій, Назарчук Богдан, Савчук Дмитро) · **Дата:** 21 жовтня 2026

---

## I. Upphaf — Початок

> Hér hefr upp sǫgu þá, er gørðisk á hausti því, er kennarinn bauð liði vára at smíða þjón einn, er skyldi stýra barnagarði. Þat boð var ritat á bók eina, ok kǫlluðu menn hana *nodejs*.

*Тут починається сага, що сталася тієї осені, коли вчитель наказав нашій дружині збудувати сервер, який мав би керувати дитячим садком. Наказ було записано в книзі, і звалася вона* nodejs.

## II. Vápn — Зброя

> Þá tóku liðsmenn til vápna sinna: Node-málm, Express-kjǫl, ok at lyktum Postgres-hirzlu, er kǫlluð var *kindergarten_local*. Sjau borð váru í hirzlunni gǫr, ok vóru þau bundin böndum, svá at engi mátti rjúfa trú þeirra.

*Тоді дружинники взялися за зброю: метал Node, кіль Express, а наприкінці — скарбницю Postgres, що звалася* kindergarten_local. *У скарбниці було створено сім таблиць, і зв'язали їх зв'язками так, що ніхто не міг порушити їхню вірність.*

## III. Fjórar tignir — Чотири ранги

> Fjórar tignir váru í ríkinu. Konungr réð ǫllu: hann einn gaf ívilnan ok breytti verði. Jarl skráði børn ok foreldra. Foreldrar sá hvert sitt barn, ok ekki annarra. Kennarar sá tíða-skrá sína.

*У королівстві було чотири ранги. Король (admin) керував усім: лише він давав пільги й змінював ціни. Ярл (manager) реєстрував дітей і батьків. Батьки бачили лише власну дитину, а не чужих. Вчителі бачили свій розклад.*

## IV. Barnagarðr ok flokkar — Садок і групи

> Børn tveggja vetra til fimm vetra váru skipuð í flokka eptir aldri. Engi flokkr mátti hafa fleiri en þrjá tigi barna, ok skyldi hverr flokkr hafa fóstra ok hjálparmann. Ef barn var of ungt eða of gamalt, vísaði garðrinn því frá.

*Діти від двох до п'яти років були розподілені по групах за віком. Жодна група не могла мати більше тридцяти дітей, і кожна мала вихователя та помічника. Якщо дитина була завмолода або застара, садок відмовляв їй.*

## V. Dagrinn ok tíða-skrá — День і розклад

> Dagr barnanna var átta stunda langr: þrjár máltíðir, einnar stundar svefn, ok fimm kennslur hvern dag — tónlist, ensk tunga, íþróttir, glíma ok skák. Engi kennari mátti kenna tveim flokkum senn. Þetta réðu rúnarnar sjálfar, ok váru kennslur jafnt skipaðar um daginn.

*День дітей тривав вісім годин: три прийоми їжі, година сну та п'ять занять щодня — музика, англійська, фізкультура, боротьба й шахи. Жоден викладач не міг вести дві групи одночасно. Це вирішували самі руни (алгоритм), а заняття були рівномірно розкладені за день.*

## VI. Gjald — Оплата

> Gjald fyrir hvert barn var fimmtán þúsundir hrívna á mánuði. Ívilnan var tíu, tuttugu eða þrjá tigi af hundraði, ok tólf af hundraði ef maðr galt árs-gjald fyrir fram. Matr kostaði þrjú hundruð hrívna á dag tveggja vetra barni, ok eitt hundrað til viðbótar fyrir hvern vetr eldra.

*Плата за дитину становила п'ятнадцять тисяч гривень на місяць. Пільга була десять, двадцять або тридцять відсотків, а ще дванадцять відсотків — якщо хтось платив за рік наперед. Харчування коштувало триста гривень на день для дворічної дитини і ще сто за кожен наступний рік.*

## VII. Gróði — Прибуток

> Þá reiknaði garðrinn gróða ok tap hvers flokks ok alls ríkisins, ok sagði til, hversu margar stofur ok hversu margir kennarar þyrftu, svá at fé týndisk eigi.

*Тоді садок почав рахувати прибуток і збитки кожної групи та всього королівства і підказувати, скільки потрібно кімнат і скільки викладачів, щоб гроші не пропадали.*

## VIII. Sagnabók — Книга змін

> Ok var ritat í bók hver breyting: hverr hana gerði, hvenær, ok hvat áðr var ok hvat síðan. Svá mátti engi dylja verk sín fyrir konungi.

*І в книгу записувалась кожна зміна: хто її зробив, коли, і що було до того, і що стало потім. Так ніхто не міг приховати своїх діянь від короля.*

## IX. Fǫr ór minni í hirzlu — Переселення з пам'яті до скарбниці

> Fyrst váru gǫgn geymd í minni, ok týndusk er þjónninn hvíldisk. Þá fluttu liðsmenn gǫgnin í Postgres-hirzlu, ok var hverr gerningr bundinn í eina heild: ef einn hlutr brast, gengu allir aptr. Svá varð ríkit traust sem bjarg.

*Спочатку дані зберігалися в пам'яті й зникали, коли сервер засинав. Тоді дружинники переселили дані до скарбниці Postgres, і кожна операція стала єдиним цілим (транзакцією): якщо ламалася одна частина, відкочувалися всі. Так королівство стало міцним, як скеля.*

## X. Raunir — Випробування

> Þá hófu menn raunir: fjórir ok sextigi, ok stóðusk allar. Skjǫldr raunanna huldi nær hundraði af hundraði rúnanna. Ok váru raunirnar gǫrvar svá, at þær snertu aldri hit sanna ríki, heldr eitt eptirmynd þess.

*Тоді взялися за випробування — їх було шістдесят чотири, і всі вони вистояли. Щит випробувань прикрив майже сто відсотків рун (коду). А випробування були зроблені так, що ніколи не торкалися справжнього королівства, лише його копії (окремої тестової бази).*

## XI. Þrautir — Незгоди

> Ekki gekk allt greitt. Einn liðsmaðr kvað: „npm: command not found“. Fór hann þá um langan veg, sótti nvm, ok gekk í villu um stíga ok slóðir, unz hann fann leiðina. Því er sagt, at engi verðr hǫfðingi, nema hann hafi villzk í terminal.

*Не все йшло гладко. Один дружинник промовив: «npm: command not found». Тоді він пішов довгою дорогою, дістав nvm, блукав стежками й шляхами, поки не знайшов дорогу. Тому й кажуть, що ніхто не стане володарем, доки не заблукає в терміналі.*

## XII. Þat sem eptir er — Що залишилось

> Þrjú verk eru eptir: at vita, hvert sé hit dulda vápn vár; at skipa um hlé barna, ef þau fara frá garði um stund; ok at rita gjalda-sǫgu, hverr galt ok hversu mikit.

*Залишилось три справи: дізнатися, яка наша додаткова вимога (суперфіча); визначити, як рахувати оплату під час паузи, коли дитина тимчасово не ходить у садок; і вести історію платежів — хто, коли і скільки заплатив.*

> **Ok lýkr þar sǫgu þessi.**
> *І на цьому завершується ця сага.*

---

# Рунічний підсумок (звичайною мовою)

| Що | Результат |
|---|---|
| Тип проєкту | REST API (backend, без інтерфейсу) |
| Стек | Node.js 22+, Express 5, PostgreSQL (`pg`), JWT, Jest + Supertest |
| База даних | PostgreSQL, 7 таблиць: `users`, `staff`, `groups`, `children`, `settings`, `schedule`, `history` (схема: `src/schema.sql`) |
| Ендпоінти | 32 |
| Ролі | admin, manager, parent, teacher |
| Основні функції | діти 2–5 років, групи до 30, генерація розкладу, оплата з пільгами й харчуванням, прибуток по групах, оптимізація, історія змін |
| Тести | 64, покриття: операторів 99.8%, рядків 100%, гілок 96% (поріг у `package.json` — 95%) |
| Документація | цей файл + `DEVELOPERS.md` (повна інструкція для розробників) |

## Швидкий старт

**Потрібно:** Node.js 22+, PostgreSQL 14+.

```bash
# 1. Створити бази (один раз)
createdb -U postgres kindergarten_local
createdb -U postgres kindergarten_test      # для тестів

# 2. Встановити залежності та запустити
npm install
npm start                                   # http://localhost:3000
```

Таблиці створюються автоматично під час старту. Адмін за замовчуванням: `admin` / `admin123`.

Підключення до БД за замовчуванням: `postgres://postgres:postgres@localhost:5432/kindergarten_local`.
Інше підключення задається змінною `DATABASE_URL`:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/kindergarten_local npm start
```

Перевірка: `curl http://localhost:3000/health` → `{"status":"ok"}`.

## Тести

```bash
npm test        # потрібна база kindergarten_test; TEST_DATABASE_URL — для іншого підключення
```

Тести очищають таблиці, тому відмовляються працювати з базою, у назві якої немає слова `test`.

## Що далі

Повна інструкція для розробників (архітектура, ендпоінти, формули, обмеження) — у **`DEVELOPERS.md`**.

## Припущення (у ТЗ не визначено; змінюються через `PATCH /settings`)

- 22 робочі дні на місяць; пільга діє лише на навчання; знижка 12% за рік наперед застосовується після пільги.
- Харчування без знижок і без націнки, оренда кімнати 0 грн.
- Вихователь, помічник і викладач — по 40 000 грн, менеджер — 80 000 грн.
- Вік — повні роки; група має фіксований вік (2–5), ліміт 30 дітей.
- День 08:00–16:00: сніданок 08:00, обід 12:00, полуденок 14:30, сон 12:30–13:30, 5 занять по 30 хв щодня.
