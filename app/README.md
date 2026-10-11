# Authority sign-in (Next.js App Router, TypeScript)

## Setup
npm i @react-oauth/google
cp .env.example .env.local   # fill NEXT_PUBLIC_GOOGLE_CLIENT_ID
# copy these folders into your project; ensure tsconfig has paths { "@/*": ["./*"] }

## Flow
/authority/login  -> Google button -> frontend gets ID token (credential)
  -> POST /auth/google {credential}
  -> backend verifies token, checks email against the hardcoded authority list, sets httpOnly session cookie
  -> frontend redirects to /authority/dashboard
Any /authority page: on load GET /auth/me; 401 -> redirect to /authority/login.
Sign out: POST /auth/logout.

## Backend contract (the only coupling; see lib/api/client.ts)
POST /auth/google  {credential}  200 {authority:{name,email,level}} | 401 {code:"INVALID_TOKEN"} | 403 {code:"NOT_AUTHORIZED"}
GET  /auth/me                    200 {authority} | 401
POST /auth/logout                204
Cookies need CORS: allow origin of the frontend + Access-Control-Allow-Credentials: true.

## Mock mode
NEXT_PUBLIC_USE_MOCK=true runs without a backend (any @iitrpr.ac.in Google account passes).
