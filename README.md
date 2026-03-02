# Daily Costs App

This repo contains:

- `daily-cost-frontend`: Vite + React app
- `daily-cost-backend`: Express + MySQL API

Local setup after cloning:

1. Copy `daily-cost-frontend/.env.example` to `daily-cost-frontend/.env`.
2. Copy `daily-cost-backend/.env.example` to `daily-cost-backend/.env`.
3. Update the backend `.env` with your MySQL credentials and a real `JWT_SECRET`.
4. Install dependencies in both packages if needed.
5. Start the backend from `daily-cost-backend` with `npm start`.
6. Start the frontend from the repo root with `npm start`, or from `daily-cost-frontend` with `npm start`.

Notes:

- The frontend now defaults to `http://localhost:3000` if `VITE_API_BASE_URL` is not set.
- The backend requires a running MySQL database and the expected schema/data.
