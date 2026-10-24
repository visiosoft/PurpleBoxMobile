# Play Console declarations — PurpleBox

Suggested answers for the **App content** section of Play Console, based on
what the code does today (`src/lib/*`, `app.json` permissions). Check them
against how the backend at api.purplebox.ae actually stores and retains data
before you submit, because you are the one making the declaration.

## App access

All functionality is behind a login. Choose **"All or some functionality is
restricted"** and give the reviewer working credentials:

- Create a dedicated reviewer account in the CRM (sales-rep role) that sees
  only test leads and test chats, not real customers.
- Instructions: "Sign in with the email and password below. The app is the
  mobile client of our internal CRM."

## Ads

**No**, the app does not contain ads.

## Content rating (IARC questionnaire)

- Category: **Utility, Productivity, Communication, or Other**
- Violence, sexuality, language, controlled substances, gambling: **No** to all
- Users can interact or exchange content: **Yes**. Staff exchange WhatsApp
  messages with customers. Content is not shared publicly, and there's no
  user-to-user social feature between app users.
- Shares user location: **No**
- Expected rating: Everyone / PEGI 3

## Target audience

**18 and over** only. It's a workplace tool. Not designed for children.

## News app

**No**

## Government app / Financial features / Health

**No** to all

## Data safety

Data is encrypted in transit (HTTPS to api.purplebox.ae): **Yes**.
Users can request data deletion: **Yes** (via the company; accounts are
company-managed, see the privacy policy). Third-party sharing: **No** (data
goes only to PurpleBox's own backend and its processors).

| Data type | Collected | Shared | Optional? | Purpose | Why |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | Required | App functionality, Account management | Profile returned at login |
| Personal info → **Email address** | Yes | No | Required | App functionality, Account management | Used to sign in |
| Personal info → **Phone number** | Yes | No | Required | App functionality | Customer phone numbers on leads and chats |
| Messages → **Other in-app messages** | Yes | No | Required | App functionality | WhatsApp replies sent through the CRM |
| Photos and videos → **Photos**, **Videos** | Yes | No | Optional | App functionality | Only when the user attaches media to a WhatsApp reply |
| App activity → **Other user-generated content** | Yes | No | Required | App functionality | Lead notes, status changes, call attempts, assistant questions |
| Device or other IDs | Yes | No | Required | App functionality | Push-notification token (`POST /users/push-token`) |

Not collected: location, contacts (the phone's address book), financial info,
health, web browsing, files and docs (documents are only *viewed*), calendar,
crash logs (no crash reporter is bundled).

**Audio:** the voice command uses Android's on-device speech service (Google
app). The app receives only the transcribed text, which it sends as an
assistant question (covered under "Other user-generated content"). The app
does not record or upload audio files, so "Voice or sound recordings" is
**not collected**. Revisit this if voice-note recording is ever added.

## Permissions that Play Console asks about

| Permission | Why the app has it | What to do |
|---|---|---|
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Added for `expo-audio` so a voice note keeps playing when the screen locks | Play Console requires a **foreground service declaration** with a short screen recording. If background playback isn't needed, remove this permission from `app.json` and skip the declaration. |
| `RECORD_AUDIO` | Spoken assistant commands | Standard runtime permission, no form |
| `POST_NOTIFICATIONS` | New-lead push notifications | No form |
| Camera (via image picker) | Take a photo or video for a WhatsApp reply | No form |
