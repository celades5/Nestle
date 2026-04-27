# Product review API — commercetools → PostgreSQL → Kafka

Node.js (ESM) service that syncs **published** commercetools product projections into **PostgreSQL**, exposes a small **REST API** (list/filter products, mark a product as reviewed), and on successful review publishes a **`product.reviewed`** event to **Kafka** (`ndg.poc.order` by default).

---

## Setup

### Prerequisites

- **Node.js** 20+ (tested with 22; project uses `"type": "module"`)
- **PostgreSQL** 14+ (local or remote), or use **Docker Compose** to run Postgres + Kafka + the API together
- **commercetools** API client with product read scope (and env URLs for your region)
- **Apache Kafka** (a running broker) if you want **`POST /productreviewed/:id` to return 200** in real conditions — the handler publishes to Kafka after saving the review. Without a reachable broker, that endpoint responds with **503** and rolls back the review. **`npm test` does not need Kafka** (Kafka is mocked). **`GET /products` works with only Postgres.** Can also be done thorugh Docker but it has not been tested

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

| Step | Command / action |
|------|------------------|
| 1. Dependencies | `npm install` |
| 2. Environment | `cp .env.` and fill in `CTP_*`, `DATABASE_URL`, and **Kafka** settings (`KAFKA_BROKERS`) |
| 3. Create DB | Create an empty PostgreSQL database (name must match `DATABASE_URL`, e.g. `nestle_challenge`) |
| 4. Kafka (for real review publishes) | Start a broker (e.g. your own Docker image) so **`KAFKA_BROKERS` in `.env` points to it** — typically `localhost:9092` on your machine. Or run **`docker compose up`** so Postgres + Kafka are up, then set `DATABASE_URL` / `KAFKA_*` to match (Compose overrides some vars for the `api` service — see `docker-compose.yaml`) (**Not Tested**) |
| 5. Check commercetools auth | `npm run auth:verify` |
| 6. Load products | `npm run db:sync` |
| 7. API | `npm start` — default **http://localhost:3000** (override with `PORT`) |
| 8. Automated tests | `npm test` |

**Summary:**  
`auth:verify` → `db:sync` → `npm start` is the minimal path to a working API with data. **Kafka** must be running **before** you call `POST /productreviewed/...` if you expect a successful publish; otherwise you can still use `GET` routes and the rest of the app.

## Simplified product: 5 fields and why

Each commercetools product projection is reduced to exactly these fields for storage, API responses, and the Kafka `payload`:

| Field | Rationale |
|--------|-----------|
| **`id`** | Stable primary key (commercetools product id) for idempotent upserts, review routing, and Kafka message keys. |
| **`name`** | Human-readable line-of-business data for listings and support; we pick a single display string from localized names. |
| **`price`** | One comparable commercial signal from the **master variant**: chosen currency (default **GBP** via `CTP_PRICE_CURRENCY`), in **major units** (not cents) for readable APIs and events. |
| **`value`** | **Stars** from a custom attribute (`stars` on the master variant) as a simple quality/satisfaction proxy when present; `null` if missing. |
| **`inStock`** | Fulfilment signal: if channel-level availability exists, `true` if any channel is on stock, `false` if none, `null` if no channel data (honest “unknown” vs false). |

Together they give **identity, merchandising, commercial, quality, and availability** without duplicating the full commercetools model. The **same five fields** appear in the **Kafka** event under `payload` (alongside `type`, `source`, and `reviewed_at` in the outer envelope) so downstream consumers (orders, analytics, etc.) get a **consistent contract** whether they read the API or the bus.

**PostgreSQL** was chosen beause is very used in production enviroments. Is powerful, open-source object-relational database system. It has a high reliability, strict data integrity (ACID compliance), and extreme extensibility. It is popular because it handles complex queries efficiently, supports advanced data types. In addition, if needed it can be expanded with a timescaleDB in case more power is required.

---

## Useful HTTP examples (port 3000 by default)

- `GET /products` — all products
- `GET /products?reviewed=false` — not yet reviewed
- `POST /productreviewed/{id}` — mark reviewed + **publish to Kafka** (requires broker reachable via `KAFKA_BROKERS`)

---

## Tests

```bash
npm test
```

Uses **mocks** for the database and Kafka, so you do not need Postgres or a broker running to execute the suite. It still validates the review routes and the Kafka event **shape** (`product.reviewed` envelope + payload fields).

---

## Docker Compose (API + Postgres + Kafka + Zookeeper)

**THE DOCKER CONDIGURATION HAS NOT BEEN TESTED**

```bash
docker compose up --build
```

- API: `http://localhost:3000`
- Run **`npm run db:sync`** from your **host** (with `DATABASE_URL` pointed at the published Postgres port, e.g. `localhost:5432`) to load data — the `api` image is built with `npm ci --omit=dev` (no dev-only tooling inside the container).

The `api` service sets `KAFKA_BROKERS` to the **internal** broker address (`kafka:29092`); for **host** runs, keep **`KAFKA_BROKERS=localhost:9092`** in your `.env`.

---

## Known trade-offs

- **Master variant only** — Price, stars, and stock are derived from the **master** variant; other variants are ignored in the simplified model.
- **Single display price** — One currency preference per run; multi-currency merchandising is not represented as a full price matrix.
- **Sync** — `db:sync` is full fetch + per-row upsert; very large catalogues may need batching, incremental sync, or a dedicated worker (not implemented here).
- **Review + Kafka** — On publish failure, the review is **rolled back** in DB so a retry can succeed; the downside is a brief window where a retry could race.
- **Docker Compose vs host** — The `api` container uses **`KAFKA_BROKERS=kafka:29092`** (internal listener); on the **host** use **`localhost:9092`** in `.env` for `npm start` / clients. (NOT TESTED)
- **Zookeeper** — The chosen Confluent Kafka image still uses **Zookeeper**; a KRaft-only image would allow dropping that service (infrastructure choice, not app logic).

---

## Project layout (high level)

| Path | Role |
|------|------|
| `src/server.js` | HTTP API, exports `app` for tests |
| `src/clients/kafka.js` | Kafka producer + `product.reviewed` envelope |
| `src/db/db.js` | Pool, schema, sync CLI (`npm run db:sync`) |
| `src/utils/productMapper.js` | Projection → 5 fields |
| `src/services/syncService.js` | Fetch from CT → map → persist |
| `tests/tests.js` | Vitest + Supertest |

## Security

- Do not commit **`.env`**. Rotate any credential that was exposed.
- Use least-privilege commercetools API clients for non-production.
