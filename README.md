Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# MomEase

A web marketplace prototype where parents in Astana find and book nannies, tutors and children's clubs. Parents search and book a dated slot, providers manage their profile and schedule, managers moderate profiles and documents, and the administrator manages accounts.

Course project, Team 04, group ITM-2402. The prototype runs on localhost only and is not deployed publicly. It uses invented data and no real payments.

- Demo video (up to 3 min): `<paste OneDrive link here>`
- SRS report: see the course submission

## Technology stack

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Drizzle ORM · PostgreSQL (or embedded PGlite for local development) · signed cookie sessions (jose) · bcrypt · zod.

## What the prototype does (by SRS requirement)

| Requirement IDs | Feature | Where in the code |
| --- | --- | --- |
| FR-01 to FR-05 | Registration with consent, login, role-based access | `src/lib/services.ts`, `src/lib/auth.ts` |
| FR-06 to FR-08 | Provider profile, age range, price, weekly slots | `src/lib/services.ts` |
| FR-09, FR-10 | Catalogue search, filters, sorting | `src/lib/services.ts`, `src/app/page.tsx` |
| FR-11 to FR-13 | Document upload (PDF/JPG/PNG, max 3 MB), manager review, "Verified" badge | `src/lib/services.ts` |
| FR-14 to FR-18 | Booking for a concrete date, duplicate slot protection, accept / decline / cancel | `src/lib/services.ts`, `src/db/schema.ts` |
| FR-19, FR-20 | Reviews only for completed bookings, one per booking | `src/lib/services.ts` |
| FR-21 to FR-24 | Booking-scoped chat, in-app notifications | `src/lib/chat.ts`, `src/lib/notify.ts` |
| FR-25 to FR-27 | Reports, support tickets | `src/lib/reports.ts`, `src/lib/support.ts` |
| FR-28 to FR-32 | Staff moderation, admin blocking with a reason | `src/lib/services.ts`, `src/lib/reports.ts` |

Additional features added after the Endterm (add them to the SRS as FR-33 and up so the traceability matrix stays complete):

- FAQ, Support, Policy (reports and blocks) and Privacy pages, with a consent checkbox at registration.
- Messages inbox: one page with all of the user's chats, jump straight into a chat.
- Favourites (parents), "Book again" on completed bookings.
- Provider flags "online" and "trial session" with catalogue filters.
- Side navigation, RU / KK / EN languages, light / dark theme.

## Run on localhost

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env        # keep the default values for local use
npm run setup               # migrations + invented demo data
npm run dev                 # http://localhost:3000
```

Without `DATABASE_URL` the app uses the embedded PGlite database stored in `.data/pglite`, so nothing else has to be installed.

## Test accounts (invented)

| Role | Email | Password |
| --- | --- | --- |
| Parent | `parent1@demo.momease.kz` | `demo12345` |
| Nanny | `nanny1@demo.momease.kz` | `demo12345` |
| Club | `club6@demo.momease.kz` | `demo12345` |
| Tutor | `tutor11@demo.momease.kz` | `demo12345` |
| Nanny waiting for moderation | `nanny-new@demo.momease.kz` | `demo12345` |
| Manager | `manager@momease.kz` | `ChangeMe-Manager-123` |
| Administrator | `admin@momease.kz` | `ChangeMe-Admin-123` |

These passwords are for local testing only.

## Tests

```bash
npm test                # runs both suites below
npm run test:smoke      # business logic and permissions on a clean database (186 checks)
npm run test:http       # starts the site and checks pages, languages, login, booking, chat, support, permissions, security headers (167 checks)
```

The manual acceptance tests TC-01 to TC-14 are described in Appendix G of the SRS.

## Security notes

- Passwords are stored as bcrypt hashes. The session is a signed `httpOnly` cookie.
- Role and account status are read from the database on every request, so a blocked user loses access at once.
- Every action checks permissions on the server, not only in the interface.
- A slot cannot have two active bookings (unique index in the database).
- Login attempts are limited, chat and support messages are rate limited.
- Secrets (`AUTH_SECRET`, passwords, database URL) live in `.env`, which is listed in `.gitignore` and must never be committed. Only `.env.example` is in the repository.
- Security headers are set in `next.config.mjs`.

## Not implemented (out of scope)

Real payments, email confirmation and password reset, identity or background checks, map / geolocation, real-time chat (the chat page refreshes every few seconds), public deployment.

## Project structure

```
src/db/schema.ts        database tables (Drizzle)
src/lib/services.ts     business logic and permission checks
src/lib/chat.ts         booking chat and inbox
src/lib/reports.ts      reports and moderation
src/lib/support.ts      support tickets
src/lib/favorites.ts    favourites
src/lib/dict.ts         translations ru / kk / en
src/app/                pages and server actions
drizzle/                SQL migrations
scripts/                migrate, seed, tests
```

## Credits

Built with open-source libraries (Next.js, React, Drizzle ORM, jose, bcryptjs, zod, nodemailer, pg, PGlite), used under their licences. No templates or UI kits were copied.
## Demo Video

Watch the MomEase prototype demonstration here: [Demo Video](https://astanait-my.sharepoint.com/:v:/r/personal/240720_astanait_edu_kz/_layouts/15/stream.aspx?id=%2Fpersonal%2F240720%5Fastanait%5Fedu%5Fkz%2FDocuments%2FTeam04%5FFP%5FDemo%2Emp4%2Emov&share=cQr%5FPeyUouQpSIGdJxnpRTkREgUC6CeAWXJLxvK0qZBHNaztWg)
