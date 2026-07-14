# Deploying this copy to Lovable

This is the **Lovable preview copy** of the Nexdigm LMS. Lovable builds the
React + Vite frontend (`npm install` + `vite build`); the `api/` (.NET) and
`*.sql` files are ignored by the frontend build.

## It works out of the box
A committed `.env` sets `VITE_USE_MOCKS=true`, so the preview runs on the
app's built-in demo data — login and every screen work with no backend.

Demo logins (any of these):
- harshit.mishra@nexdigm.com / Admin@123  (Admin)
- harsh.mittal@nexdigm.com / Manager@123  (Manager)
- aditi.sharma@nexdigm.com / Exec@123      (Executive)

## Going to a real backend later
Remove `.env` (or set `VITE_USE_MOCKS=false`) and set `VITE_API_URL` to your
hosted API URL. The app then talks to the live .NET API + SQL Server and no
longer uses demo data.

> Note: this `.env` is committed on purpose for the Lovable copy only. Do not
> carry it into the production deployment.
