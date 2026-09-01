# Trip Tools

This repo contains:

- `daily-cost-frontend`: Trip Tools Vite + React client
- `daily-cost-backend`: Trip Tools Express + MySQL API

Local setup after cloning:

1. Copy `daily-cost-frontend/.env.example` to `daily-cost-frontend/.env`.
2. Copy `daily-cost-backend/.env.example` to `daily-cost-backend/.env`.
3. Update the backend `.env` with your MySQL credentials and a real `JWT_SECRET`.
4. Install dependencies in both packages if needed.
5. Run `npm run migrate` in `daily-cost-backend` once, then start it with `npm start`.
6. Start the frontend from the repo root with `npm start`, or from `daily-cost-frontend` with `npm start`.

Notes:

- The frontend now defaults to `http://localhost:3000` if `VITE_API_BASE_URL` is not set.
- Authentication is isolated in `trip_users`; the original shared `users` table is not used for login.
- Trip access is controlled by `trip_tools_members`. Invitation codes are single-use and expire after seven days.
- New standalone trip owners are created by an administrator. Invited companions register from the login page.
