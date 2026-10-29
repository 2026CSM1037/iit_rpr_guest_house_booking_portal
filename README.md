****# IIT Ropar Guest House Booking Portal

A web portal for requesting, approving and managing guest house stays at IIT Ropar. Applicants submit a booking request online, a chain of approving authorities accepts, rejects, holds or forwards it, and the guest house receptionist handles on-site check-in, check-out, the PDF bill and payment status.

Everything is stored in a **Google Sheet** (one row per booking) and uploaded documents go to **Google Drive**, so no separate database is needed.

## Features

**Applicants (`/user`)**
- Sign in with an `@iitrpr.ac.in` Google account
- Booking form: applicant details, category, payment source, purpose, number of rooms (1–10), and 1–4 guests with arrival/departure
- Upload a primary ID and an optional approval document (PDF, JPG or PNG, max 5 MB, validated by extension, size and file signature)
- Room charges are calculated on the server, never trusted from the browser
- Track every booking and its approval trail, and cancel while it is pending, on hold or booked (not after check-in)
- E-mail notification at every update

**Authorities (`/authority`)**
- Fixed list of admin accounts (see `Backend/admins.py`)
- Every new request goes to the first admin, who can **approve, reject, hold, resume or forward** it to any other admin; the admin holding the request can act on it
- Rejecting or holding requires remarks
- Views: requests with me, my history, and (first admin only) all requests
- Full approval trail kept for each booking

**Receptionist (`/receptionist`)**
- Sees only approved (Booked) requests
- Records on-site check-in and check-out
- Check-out generates a PDF bill, stores it in Drive and e-mails it to the applicant
- Marks the bill as paid after payment is collected at the desk (no online payment)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, `@react-oauth/google` |
| Backend | Python, FastAPI, Uvicorn |
| Auth | Google sign-in (ID token verified on the server), signed httpOnly session cookies (8 hours), one cookie per role |
| Storage | Google Sheets API (bookings) and Google Drive API (uploads, bills) via a service account |
| E-mail | SMTP, or the Gmail API with a Workspace service account |
| Bills | ReportLab (PDF) |

## Repository layout

```
.
├── Backend/
│   ├── main.py            # FastAPI app: auth, bookings, authority and receptionist endpoints
│   ├── admins.py          # Demo and official authority e-mail lists
│   ├── mailer.py          # SMTP / Gmail API e-mail sender (runs as a background task)
│   ├── bill.py            # PDF bill generation
│   ├── testmail.py        # Quick script to test the e-mail setup
│   ├── requirements.txt
│   └── run.bat            # Windows helper: venv + install + run on port 8000
└── Frontend/
    ├── app/
    │   ├── user/          # Login, booking form, status, confirmation
    │   ├── authority/     # Login and dashboard
    │   └── receptionist/  # Login and dashboard
    └── lib/
        ├── api/           # client.ts is the only file that talks to the backend
        ├── auth/          # Per-role auth context
        └── ui/            # Shared components (dialogs, booking card, room picker)
```

## Getting started

### Prerequisites

- Python 3.9+ and Node.js 20+
- A Google Cloud project with:
  - an **OAuth client ID** (Web) for Google sign-in, with your frontend origin (e.g. `http://localhost:3000`) as an authorized origin
  - the **Google Sheets API** and **Google Drive API** enabled
  - a **service account** with a JSON key saved as `Backend/credentials.json`
- A Google Sheet shared with the service account as **Editor**, and (optionally) a Drive folder shared with it for uploads

### 1. Backend

```bash
cd Backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `Backend/.env`:

```env
# Required
GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
SPREADSHEET_ID=your-google-sheet-id
SECRET_KEY=a-long-random-string

# Optional
SHEET_NAME=Bookings                       # tab name (created with headers if missing)
DRIVE_FOLDER_ID=                          # Drive folder for uploads
SERVICE_ACCOUNT_FILE=credentials.json
FRONTEND_ORIGIN=http://localhost:3000     # comma-separated list for CORS
COOKIE_SECURE=false                       # set true behind HTTPS
FIRST_ADMIN_EMAIL=                        # defaults to the first demo admin
EXTRA_ADMIN_EMAILS=                       # comma-separated extra admins
RECEPTIONIST_EMAILS=                      # comma-separated receptionist accounts

# E-mail: use SMTP ...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
# ... or send through the Gmail API as a Workspace mailbox
GMAIL_SENDER=
```

If `SMTP_HOST` is not set, e-mails are printed to the console instead of being sent. To check your mail setup, run `python testmail.py`.

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

On Windows you can run `run.bat` instead, which does the venv setup, installs dependencies and starts the server. The API is then at `http://localhost:8000` (health check: `GET /health`).

### 2. Frontend

```bash
cd Frontend
npm install
```

Create `Frontend/.env.local`:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

```bash
npm run dev        # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm run lint`.

Open `http://localhost:3000`, which redirects to the applicant portal. Authorities use `/authority/login` and the receptionist uses `/receptionist/login`.

## How a booking flows

```
Applicant submits  ->  Pending Approval (with the first admin)
                          |-- forward -> another admin (still Pending Approval)
                          |-- hold    -> On Hold  (resume or forward later)
                          |-- reject  -> Rejected
                          '-- approve -> Booked
Booked -> receptionist check-in -> check-out (PDF bill e-mailed) -> payment marked Paid
Applicant can cancel -> Cancelled (before check-in)
```

## Room categories and rates

Rates are defined in `RATES` in `Backend/main.py` (per room, per night):

| Category | Rate |
|---|---|
| Executive Suite — Category-A | Free |
| Executive Suite — Category-B | ₹3,500 |
| Business Room — Category-A | Free |
| Business Room — Category B-1 | ₹2,000 |
| Business Room — Category B-2 | ₹1,200 |

Total charge = rate × nights × rooms. Nights are counted from the first guest's arrival and departure (rounded up, minimum 1).

## API overview

All endpoints use JSON errors of the form `{ "code": "..." }`. Each role has its own sign-in endpoints: `POST {prefix}/google`, `GET {prefix}/me` and `POST {prefix}/logout`.

| Role | Prefix | Main endpoints |
|---|---|---|
| Applicant | `/user/auth` | `POST /bookings` (multipart), `GET /user/bookings`, `GET /user/bookings/{id}`, `POST /user/bookings/{id}/cancel` |
| Authority | `/auth` | `GET /authority/admins`, `GET /authority/bookings?scope=mine\|history\|all`, `POST /authority/bookings/{id}/decision` |
| Receptionist | `/receptionist/auth` | `GET /receptionist/bookings`, `POST .../{id}/checkin`, `POST .../{id}/checkout`, `GET .../{id}/bill`, `POST .../{id}/payment` |

FastAPI also serves interactive docs at `/docs` while the server is running.

## Configuring who can sign in

- **Applicants:** any verified `@iitrpr.ac.in` Google account.
- **Authorities:** the lists in `Backend/admins.py`, plus `EXTRA_ADMIN_EMAILS`. The first admin (`FIRST_ADMIN_EMAIL`) receives every new request.
- **Receptionists:** the `RECEPTIONIST_EMAILS` environment variable.

Access is re-checked on every request, so removing an e-mail revokes access immediately.

## Security notes

- Never commit `.env` or `credentials.json` (both are in `Backend/.gitignore`).
- Data is written to Sheets with `RAW` input so user text can never run as a spreadsheet formula.
- Applicants never see approver e-mails or admin-only links in API responses.
- Set `COOKIE_SECURE=true` and serve over HTTPS in production.

## Known gaps

- `Frontend/lib/api/client.ts` already has calls for room allotment (`/authority/bookings/{id}/rooms` and `/allot`), but these endpoints are not implemented in the backend yet.
- `Frontend/app/README.md` is a leftover note from the early authority sign-in prototype and mentions a mock mode that the current code does not use.
- The repo has no `.env.example` files yet, so the variables above are the reference.

## Team

- Anirudh Shukla(2026AIM1002)
- Soudip Das(2026CSM1037)
- Sanket Bandgar(2026AIM1020)
- Aman Singh Bisht(2026CSM1005)

