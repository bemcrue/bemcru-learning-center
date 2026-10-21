# Bemcru registration migration: Google Apps Script → Supabase

The production website is intentionally still using the existing Apps Script endpoint until Supabase is configured and tested. Do not remove that endpoint from `index.html` before the replacement works.

## 1. Create a Supabase project
Create a project at https://supabase.com/dashboard. Keep the database password private.

## 2. Create the registrations table
Open **SQL Editor** in the Supabase project and run `supabase/schema.sql`.

## 3. Deploy the Edge Function
In Supabase Dashboard, create an Edge Function named `register-learner` and paste in `supabase/functions/register-learner/index.ts`, then deploy it. Alternatively, use the Supabase CLI from a local checkout.

## 4. Configure Edge Function secrets
Set these in **Edge Functions → Secrets** (or with the Supabase CLI):
- `SUPABASE_URL` (the project URL)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never put this in website HTML or GitHub)
- `WHATSAPP_ACCESS_TOKEN` (Meta access token; keep private)
- `WHATSAPP_PHONE_NUMBER_ID` (Meta's sender Phone Number ID)
- `WHATSAPP_API_VERSION` (the version shown by Meta's API setup)
- `WHATSAPP_RECIPIENT` = `254704514801`
- `WHATSAPP_TEMPLATE_NAME` = `hello_world` for the initial Meta test sender test

The Meta `hello_world` template verifies delivery but does not include learner details. For detailed alerts, create and get approval for a WhatsApp template named `registration_alert` with five body placeholders, in this order:
1. Learner name
2. Grade/Form
3. Parent/Guardian name
4. Parent/Guardian phone
5. Selected subjects

Then change `WHATSAPP_TEMPLATE_NAME` to `registration_alert`.

## 5. Configure the website
In `index.html`, replace the old hidden-iframe Apps Script form submission with a POST to:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/register-learner`
Send JSON fields matching the existing registration form. Convert selected subjects into an array and send `consent: true` only after the user has checked the consent checkbox. Add the project's publishable/anon key as the `apikey` header if required by the deployed function's gateway settings. Never expose the Supabase service-role key or WhatsApp token in browser code.

## 6. Test before switching
Test a registration and verify that it appears in `public.registrations`. Test the WhatsApp delivery separately. Only after both work should the production website stop calling Apps Script. Keep the existing Apps Script project and spreadsheet as a rollback/archive until the migration is confirmed.
