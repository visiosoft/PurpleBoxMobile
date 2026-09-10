# PurpleBox Mobile — Build Plan

A separate React Native project that reuses the existing PurpleBox web API
(`api.purplebox.ae`) — no new backend, same login, same data. Built one
feature at a time, in the order requested.

## Stack

- **Expo (managed workflow)** + **Expo Router** (file-based routing, SDK 57)
- **NativeWind v4** (Tailwind for React Native) on **Tailwind CSS v3.4**
- **React Query** for server state/caching
- **expo-secure-store** for the auth token (Keychain/Keystore-backed — the
  mobile equivalent of the web app's `localStorage` token)
- **axios** client pointed at `https://api.purplebox.ae/api` — the exact
  same base URL and endpoints the web app calls
- Fonts/colors mirror the web app's design system (Bricolage Grotesque for
  display type, Plus Jakarta Sans for body text, brand purple `#5B2BC9`)

## Auth

Same credentials as the web app. `app/login.tsx` posts directly to
`/api/auth/login` — the identical endpoint `office.purplebox.ae` uses — and
stores the returned token + user with `expo-secure-store`. Any user who can
sign into the office app can sign into the mobile app with no separate
registration step.

## Feature build order

| # | Feature | Status | Reuses |
|---|---------|--------|--------|
| 1 | Login & session | ✅ Done | `POST /api/auth/login`, `expo-secure-store` |
| 2 | WhatsApp | ✅ Done | `GET/POST /api/whatsapp/*`, `GET /api/leads/:id/score` |
| 3 | Leads (incl. AI scoring) | ✅ Done | `GET /api/leads`, `/stats`, `/:id`, `/:id/status`, `/:id/attempts`, `/:id/comments`, `/:id/convert`, `/:id/score` |
| 4 | Search Unit | ⏳ Next | `GET /api/quotes/available-units` |
| 5 | AI Chat Bot | ⏳ Pending | `POST /api/assistant` |

Nothing is skipped — each stub tab already names its real endpoint and this
plan file, so the scope is locked in even before it's built.

## What's built so far (Feature 1 — Login & Auth)

- `app/_layout.tsx` — font loading, React Query provider, auth-aware route
  guard (signed out → `/login`, signed in → the tab shell)
- `app/login.tsx` — email/password form matching the web app's visual style
- `src/lib/api.ts` — axios client, bearer token interceptor, 401 auto-logout
- `src/lib/auth.tsx` — `AuthProvider` / `useAuth()`, session persisted in
  SecureStore across app restarts
- `src/lib/theme.ts` — color/font constants shared across screens
- `app/(tabs)/_layout.tsx` — 5-tab shell: WhatsApp, Leads, Search Unit,
  Assistant, Profile
- `app/(tabs)/profile.tsx` — real screen: shows the signed-in user, sign out
- `app/(tabs)/units.tsx`, `assistant.tsx` — placeholder screens naming the
  endpoint each will call

## What's built so far (Feature 2 — WhatsApp)

- `app/(tabs)/whatsapp/index.tsx` — conversation list: owner tabs (All /
  Mine / Waiting / Tenants / Unassigned / Quiet) with live counts, search
  (debounced, server-side), unread dot + bold name (tracked locally — the
  web app has no server-side "read" state either, see `src/lib/seen.ts`),
  waiting-time chip, pull-to-refresh, polls every 10s like the web console
- `app/(tabs)/whatsapp/[phone].tsx` — the thread: inverted message list,
  bubbles for text/image/video/voice/document, composer with photo/video
  attach (camera or library) and upload progress, polls every 5s
- `src/components/whatsapp/Attachment.tsx` — renders every media kind the
  web console handles; images/video/voice stream through the authenticated
  `/api/whatsapp-media/:messageId` proxy and are cached to a local file
  (`src/lib/media.ts`) so scrolling never re-downloads them
- `src/components/whatsapp/ScoreSheet.tsx` — the AI lead-score panel as a
  bottom sheet (native header "Score" button on any chat linked to a lead):
  band + score, reasoning, suggested next action, signals, the "when do
  they need it" date picker, and the qualifying/not-interested confirm
  buttons — same three endpoints as the web app's right-hand panel
- `src/lib/whatsapp.ts` — types and API calls ported field-for-field from
  `client/src/lib/api.ts`'s `whatsappApi`/`leadApi`

**Left out of this pass** (present on web, not yet on mobile — nothing
silently dropped, just not built yet): editing/deleting a sent message,
approved-template sends, quick replies, label management, assigning an
unowned chat to a rep, and voice-note recording. These can be added later
if needed; they weren't asked for by name and the four core actions (read,
send text, send media, see the score) cover the day-to-day use case.

## What's built so far (Feature 3 — Leads)

- `app/(tabs)/leads/index.tsx` — list: status filter chips with live counts
  from `GET /leads/stats`, search (debounced, server-side), infinite scroll
  (`GET /leads` is paginated 25 at a time) — server already scopes a sales
  rep to their own leads and an admin to everyone's, so nothing extra is
  filtered client-side
- `app/(tabs)/leads/[id].tsx` — detail: quick actions (Call, WhatsApp —
  opens the same chat thread from Feature 2, Email, Score — reuses
  `ScoreSheet` from Feature 2), a status changer (same pipeline/labels/
  colors as the web app's `LEAD_STATUS_FLOW`), attempt logging (channel +
  optional note + outcome, `POST /:id/attempts`), a merged notes/timeline
  feed with the ability to add a note (`POST /:id/comments`), and "Convert
  to customer" (`POST /:id/convert`)
- `src/lib/leads.ts` — types and API calls ported field-for-field from
  `client/src/lib/api.ts`'s `Lead`/`LeadQuery`/`LeadPage`/`leadApi` and the
  attempt/outcome enums in `server/src/models/index.js`
- `src/lib/leadStatus.ts` — the same status pipeline, labels, and colors as
  the web app's `LEAD_STATUS_FLOW` / `leadStatusTone`
- `src/components/PickerSheet.tsx` — a reusable native-style action sheet
  (status picker here; general-purpose for later features)

**Left out of this pass**: bulk actions, reassigning a lead's owner
(admin-only on web), the follow-up plan editor, and lead creation/import —
none of these were asked for by name, and every write path a rep actually
needs day-to-day (status, attempts, notes, convert) is covered.

Verified: `npx tsc --noEmit` clean, `npx expo export --platform ios`
bundles successfully after each feature.

## Design system

Matches the web app, adapted to native/Apple UI conventions:

- **Colors**: brand purple `#5B2BC9` (dark `#4A1FA0`, tint `#EDE5FF`), ink
  `#14081F`, muted `#756E80`, paper background `#FBF8F2`
- **Type**: Bricolage Grotesque (display/headings), Plus Jakarta Sans
  (body, medium, bold weights)
- **Patterns**: native iOS tab bar (`expo-router` Tabs), rounded cards,
  soft shadows, native `Alert` for destructive confirmations (sign out),
  SF Symbols-style Ionicons throughout
