# Triage — Cordova Symptom Checker (Grok API)

A hybrid mobile app (Apache Cordova) that walks a user through a short,
conversational symptom check and returns a plain-language urgency level and
possible causes — powered by xAI's Grok API. It is a triage aid, not a
diagnostic tool.

## How it's structured

```
symptom-checker-cordova/
├── config.xml              # Cordova app manifest, permissions, plugins
├── www/                     # The app itself (HTML/CSS/JS)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js        # Points the app at your backend URL
│       └── app.js           # View logic + conversation loop
└── server/                  # Node/Express backend (deploy separately)
    ├── server.js            # Proxies to the Grok API, holds the system prompt
    ├── package.json
    └── .env.example
```

**Why a backend at all?** The Grok API key must never ship inside the app
package — anyone can unzip an APK/IPA and read a bundled JS file. The
`server/` folder is a thin proxy: the app calls your backend, and your
backend calls Grok with the key that only it knows.

## 1. Run the backend

```bash
cd server
npm install
cp .env.example .env
# edit .env and paste your real GROK_API_KEY from https://x.ai/api
npm start
```

This starts the API on `http://localhost:3000` with a single endpoint,
`POST /api/triage`, that the app calls on every turn of the conversation.
Deploy it anywhere that runs Node (Render, Railway, a small VPS, etc.) —
it's the same kind of Express service you've already deployed before.

## 2. Point the app at your backend

Edit `www/js/config.js`:

```js
window.APP_CONFIG = {
    API_BASE_URL: 'https://your-deployed-backend.com'
};
```

## 3. Set up the Cordova project

If you don't already have the Cordova CLI:

```bash
npm install -g cordova
```

Then, from a fresh working folder:

```bash
cordova create triage com.sushant.symptomchecker Triage
cd triage
# replace the generated config.xml and www/ with the ones from this project
cordova platform add android
# cordova platform add ios   (macOS only, needs Xcode)
cordova plugin add cordova-plugin-whitelist cordova-plugin-device \
  cordova-plugin-network-information cordova-plugin-geolocation \
  cordova-sqlite-storage cordova-plugin-local-notification
```

## 4. Run it

```bash
cordova run android          # or: cordova run browser  for quick testing
```

The `browser` platform is the fastest way to iterate on the UI, since
`deviceready` isn't required there (the app falls back to a normal
`DOMContentLoaded` boot — see the bottom of `app.js`).

## Conversation flow

1. **Disclaimer** — the user must acknowledge this isn't a diagnosis.
2. **Intake** — free-text symptom description + age, sex, relevant history.
3. **Chat loop** — the backend asks up to 4 targeted follow-up questions
   (skipped early if the model detects a possible emergency), then returns a
   structured result instead of another question.
4. **Result** — a color-coded urgency banner (low / moderate / urgent),
   a short list of possible (non-diagnostic) causes, and a plain-language
   recommendation that always says when to seek in-person or emergency care.

## Where to extend this

- **Care locator**: `cordova-plugin-geolocation` is already added — call it
  after an "urgent" or "moderate" result and pair it with a places API to
  suggest nearby clinics/ERs.
- **History log**: `cordova-sqlite-storage` is included but unused — a
  natural next step is saving past check-ins locally so a user (or their
  doctor) can review the trend.
- **Reminders**: `cordova-plugin-local-notification` is included for a
  future "check back in a few hours" nudge on moderate-urgency results.
- **Voice input**: consider `cordova-plugin-speechrecognition` for the
  intake textarea, useful for users who are unwell or have limited mobility.

## Safety notes baked in

- The backend's system prompt forces structured JSON output and forbids the
  model from stating a definite diagnosis.
- Any red-flag symptom description short-circuits the follow-up questions
  and returns an "urgent" result immediately.
- The disclaimer, the result screen, and the system prompt all repeat the
  same message: this supports a decision, it doesn't replace a clinician.
