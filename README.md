# HR Management System

Enterprise HR Management System — Phase 1: Authentication & User Management.

## Stack

- **Backend:** FastAPI, SQLAlchemy, Alembic, JWT/OAuth2, Google Login, bcrypt, Pydantic
- **Frontend:** React, Vite, React Router, Axios, React Hook Form, Tailwind CSS
- **Database:** MySQL (local)

## Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then fill in real DB password / JWT secret
alembic upgrade head
uvicorn app.main:app --reload
```

API runs at `http://localhost:8000`, docs at `http://localhost:8000/docs`.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

## Project Structure

```
backend/   FastAPI app (layered: api -> controllers -> services -> repositories -> models)
frontend/  React + Vite app (pages, components, hooks, services, context, layouts, routes)
```

## Notes

- There is no public registration page. Users are created only by accounts holding the
  `CREATE_USER` permission (Super Admin / HR Admin / HR Executive hierarchy).
- See `backend/alembic/versions/` for the auth schema migration (12 tables: users, roles,
  permissions, role_permissions, user_roles, login_logs, refresh_tokens,
  password_reset_tokens, email_verification_tokens, google_accounts, sessions, audit_logs).
