# Twello Demo

Twello Demo is a clean demo copy of Twello, a kanban app with collaborative sticky notes. Built with Next.js, shadcn/ui, Better Auth and PostgreSQL, it is packaged for Zenith.

## Run locally

Use Node.js 22 or newer and Docker.

```sh
npm install
npm run setup
npm run dev
```

Open [localhost:3100](http://localhost:3100). Create an account to sign in immediately. `npm run setup` creates a gitignored `.env.local` with random secrets, starts Postgres, and applies migrations. Existing environment files are preserved.

Email delivery and verification are temporarily disabled, including password-reset emails and email invitations. Email remains the login identifier. Board sharing uses editor or viewer links.

## Deploy on Zenith

The web service builds from the root Dockerfile. When you publish from the Zenith developer dashboard, Zenith builds an image from the selected commit; this takes a few minutes. Zenith generates `PGPASSWORD` and `BETTER_AUTH_SECRET` and maps `BETTER_AUTH_URL` to `ZENITH_PUBLIC_URL`, so no secrets are needed.

```sh
npm i -g @zenith-hosting/cli
zenith auth login
zenith check
zenith up
```

`zenith up` starts an ephemeral preview built from source.

## Checks

```sh
npm run verify:smoke
npm run build
```

The smoke test runs only against localhost.
