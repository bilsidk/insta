# InstaGrowth — PROJECT STATE

---

## 1. TECH STACK & ARCHITECTURE

**Backend:** Node.js + Express · PostgreSQL (Neon via Railway) · JWT auth · Resend (email alerts)
**Mobile:** React Native 0.85 · react-navigation v6 (bottom tabs + native stack) · react-native-inappbrowser-reborn · react-native-config · AsyncStorage

**Repos:**
- Backend: `D:\insta` → `https://github.com/bilsidk/insta.git` (branch: main) → auto-deploys to Railway service `insta`, project `pleasing-serenity`
- Mobile: `D:\insta\mobile` (gitignored from backend repo, tracked via `git add -f`)
- Backup repo: `https://github.com/bilsidk/insta_optim` (full project copy)

**Live URLs:**
- Backend: `https://insta-production-91be.up.railway.app`
- Auth done sentinel: `https://insta-production-91be.up.railway.app/auth/done`

**Data flow:**
```
Mobile → Instagram OAuth (Chrome Custom Tab via openAuth, www.instagram.com/oauth/authorize)
       → Backend /auth/instagram/callback
       → Upserts instagram_accounts, stores {JWT, userId} in _sessions map keyed by state
       → Redirects to /auth/done?ok=1&sid=<state>
       → /auth/done serves HTML that bounces to com.instagrowth://auth?ok=1&sid=<state>
       → openAuth resolves; mobile polls /auth/instagram/status?session_id=<state>&device_id=<id>
         (enforces MAX_ACCOUNTS_PER_DEVICE + registers device) → gets JWT
       → All subsequent calls: Authorization: Bearer <JWT>
```

**Plan A / Plan B:**
- Plan A (live mode): comment = exact via /{media}/comments; follow/like = count-delta vs
  server-recorded baseline (task_starts, POST /tasks/:id/start)
- Plan B: Honor mode (degraded) — triggered after 25 failures in 5 min
- 30-min recovery timer: server probes API, auto-recovers if reachable
- Email alert via Resend when switching to degraded

**Railway env vars (insta service):**
```
DATABASE_URL, JWT_SECRET, OWNER_EMAIL, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET,
INSTAGRAM_REDIRECT_URI, RESEND_API_KEY, ALLOWED_ORIGINS, PUBLIC_BASE_URL,
DB_SSL_NO_VERIFY=true, NODE_ENV=production
OWNER_INSTAGRAM_ID=<your IG user id>   # optional: auto-promotes this account to owner on boot
```

**Mobile .env (`D:\insta\mobile\.env`):**
```
INSTAGRAM_APP_ID=1536973521391631
API_URL=https://insta-production-91be.up.railway.app
```

---

## 2. ACTIVE DB SCHEMA

```sql
CREATE TABLE account_history (
  instagram_user_id VARCHAR(255) PRIMARY KEY,
  bonus_granted     BOOLEAN DEFAULT FALSE,
  was_banned        BOOLEAN DEFAULT FALSE,
  ban_reason        TEXT,
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE instagram_accounts (
  id                  SERIAL PRIMARY KEY,
  instagram_user_id   VARCHAR(255) UNIQUE NOT NULL,
  username            VARCHAR(255) NOT NULL,
  account_type        VARCHAR(50),
  profile_pic_url     TEXT,
  access_token        TEXT,
  refresh_token       TEXT,
  token_expiry        TIMESTAMP,
  coins               INTEGER DEFAULT 0,
  role                VARCHAR(20) DEFAULT 'user',   -- 'user' | 'premium' | 'owner'
  is_premium          BOOLEAN DEFAULT FALSE,
  is_banned           BOOLEAN DEFAULT FALSE,
  ban_reason          TEXT,
  last_task_at        TIMESTAMP,
  device_id           VARCHAR(255),
  reclaim_count       INTEGER DEFAULT 0,
  trust_score         INTEGER DEFAULT 100,
  banned_at           TIMESTAMP,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  account_id                INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  task_type                 VARCHAR(50) NOT NULL,   -- 'follow' | 'like' | 'comment'
  target_instagram_user_id  VARCHAR(255),
  instagram_media_id        VARCHAR(255),
  instagram_media_thumbnail TEXT,
  instagram_media_permalink TEXT,
  instagram_media_caption   TEXT,
  reward                    INTEGER NOT NULL,
  slot_cost                 INTEGER NOT NULL DEFAULT 0,  -- 0 for owner campaigns
  remaining_slots           INTEGER NOT NULL,
  total_slots               INTEGER NOT NULL,
  status                    VARCHAR(20) DEFAULT 'active', -- 'active'|'paused'|'cancelled'|'completed'
  owner_tier                INTEGER DEFAULT 3,  -- 1=owner, 2=premium, 3=user
  created_at                TIMESTAMP DEFAULT NOW()
);

CREATE TABLE completions (
  id               SERIAL PRIMARY KEY,
  task_id          INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  instagram_user_id VARCHAR(255),
  verify_method    VARCHAR(20) DEFAULT 'api',     -- 'api' | 'honor'
  verify_status    VARCHAR(20) DEFAULT 'verified', -- 'verified' | 'pending' | 'reclaimed'
  coins_awarded    INTEGER DEFAULT 0,
  last_audit_at    TIMESTAMP,
  audit_count      INTEGER DEFAULT 0,
  verified_at      TIMESTAMP DEFAULT NOW(),
  completed_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE TABLE transactions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  type        VARCHAR(50) NOT NULL,  -- 'bonus' | 'spent' | 'earned'
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE device_accounts (
  id        SERIAL PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  user_id   INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  UNIQUE(device_id, user_id)
);

CREATE TABLE task_starts (
  task_id        INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  baseline_count INTEGER,            -- followers_count/like_count at start; NULL = honor fallback
  started_at     TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE app_settings (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  api_mode       VARCHAR(20) DEFAULT 'live',  -- 'live' | 'degraded'
  degraded_reason TEXT,
  settings       JSONB DEFAULT '{}',
  updated_at     TIMESTAMP DEFAULT NOW()
);
-- settings JSONB keys: daily_limit_user(50), daily_limit_premium(150),
--   coins_follow(5), coins_like(3), coins_comment(6), house_margin(3),
--   completion_delay_seconds(30), max_campaigns_per_user(5)
```

**Migration:** additive migration runs automatically on every boot (server.js). `node src/migrate.js`
runs it manually; `--full` wipes + rebuilds the whole schema. ⚠️ A brand-new/empty DB must run
`node src/migrate.js --full` ONCE — the boot migration is additive-only (it ALTERs tables that must
already exist; on an empty DB those errors are swallowed non-fatally and every query then fails).

---

## 3. CORE API ENDPOINTS

**Auth** (`/auth`, rate limited 10/15min)
```
POST   /auth/instagram          body:{code, device_id} → {token, user, instagram_connected}  (legacy, unused by app)
GET    /auth/instagram/callback query:{code,state,error} → redirect to /auth/done?ok=1&sid=<state>
GET    /auth/instagram/status   query:{session_id, device_id?} → {ready:bool, token?}
       -- enforces MAX_ACCOUNTS_PER_DEVICE at token pickup, registers device; 403 DEVICE_LIMIT
GET    /auth/done               → HTML page that redirects to com.instagrowth://auth?<query>
```

**Users** (`/users`)
```
GET    /users/me     → {user}
DELETE /users/me     → {ok, message}  -- saves account_history before delete
```

**Accounts** (`/accounts`)
```
GET    /accounts/posts       → [{id, media_type, thumbnail_url, permalink, caption}]
POST   /accounts/disconnect  → {ok}
```

**Tasks** (`/tasks`)
```
GET    /tasks/pricing        → {follow:{reward,slot_cost}, like:..., comment:..., house_margin, completion_delay_seconds}
GET    /tasks                query:{type?} → [{task + owner info}]  (excludes own tasks, completed)
GET    /tasks/my             → [{task + completions_count, progress_pct, can_pause, can_resume, can_cancel}]
POST   /tasks                body:{task_type,followers_wanted,instagram_media_id,...} → {task,coins_spent,slot_cost,earner_reward,owner}
       -- campaignLimiter: 20/hr per IP on this route only; media_id required for like/comment
POST   /tasks/:id/start      → {ok, started_at(ms), delay_seconds}
       -- records baseline_count (followers/like count via owner token) in task_starts; idempotent
POST   /tasks/:id/verify     body:{started_at?, device_id?} → {verified, method, degraded, coins_earned, new_balance, message}
       -- uses task_starts.started_at when present (client started_at = legacy fallback)
PATCH  /tasks/:id/pause      → {ok, status, remaining_slots}
PATCH  /tasks/:id/resume     → {ok, status, remaining_slots}
PATCH  /tasks/:id/cancel     → {ok, refunded_coins, remaining_slots}
```

**Transactions** (`/transactions`)
```
GET    /transactions         → [{id, amount, type, description, created_at}]
```

**Admin** (`/admin`, 60/15min, owner-role enforced in controller)
```
GET    /admin/status         → {mode, settings, stats}
PATCH  /admin/settings       body:{coins_follow?,coins_like?,coins_comment?,house_margin?,...} → {ok}
POST   /admin/mode           body:{mode:'live'|'degraded', reason?} → {ok}
POST   /admin/promote        body:{username, role:'premium'|'user'} → {ok}
POST   /admin/grant-coins    body:{username, amount} → {ok}
GET    /admin/users          query:{page?,username?} → {users, total, page, pages}
POST   /admin/ban            body:{username|user_id, reason?, unban?} → {ok}
       -- promote/grant/ban resolve via resolveTargetId(): prefer user_id; username
          falls back but 409 AMBIGUOUS_USERNAME if it matches >1 account (not unique)
```

**Health**
```
GET    /health               → {status:'ok', timestamp}
```

---

## 4. CURRENT WORKING STATE

### Working Features
- Instagram Business Login OAuth (Chrome Custom Tab via `InAppBrowser.openAuth`)
- JWT auth, 30-day tokens
- Task feed (follow/like/comment campaigns), verification (Plan A API + Plan B honor)
- Anti-cheat: velocity limits, device limits, trust score, audit scheduler (every 30min, 2h+48h re-audit passes)
- Campaign CRUD: create, pause, resume, cancel with coin refund
- Coin economy: earner reward + house margin, admin-configurable via DB
- Plan A→B degraded switching with server probe + 30-min auto-recovery + Resend email alert
- Admin panel: promote, ban, grant coins, toggle mode, adjust settings
- Bottom tab navigation (Tasks📋 / Grow📈 / Profile👤)
- 15-language i18n (en, fr, ar, es, pt, hi, tr, de, zh-CN, zh-TW, bn, ja, ko, ru, id)
- Language picker in ProfileScreen
- Delete Account button spaced from Sign Out
- All 8 security fixes deployed (see below)

### Security Fixes Applied (commit `0fec6cb`, deployed)
1. `account_history` table — ban evasion + bonus farming prevention
2. OAuth: state ≥16 chars required; token NOT in redirect URL (session-based); `PUBLIC_BASE_URL` env var; no code logging
3. `verifyTask` FOR UPDATE requires `status='active'`; `cancelCampaign` ownership read inside tx
4. `verifyFollow/Like/Comment` throw on transport errors (5xx/network), return false only when action not found
5. `verifyLike(ownerUserId, mediaId, userIgId)` / `verifyComment(ownerUserId, ...)` — explicit owner param (no DB lookup by mediaId)
6. `campaignLimiter` moved to `POST /tasks` only (was applying to all /tasks routes)
7. `slot_cost=0` stored for owner campaigns (prevents refund coin minting)
8. Removed dead `req.userEmail`; server.js fail-fast on missing `JWT_SECRET`/`DATABASE_URL`; `DB_SSL_NO_VERIFY` env var

### Mobile Auth Flow (current)
```js
// instagramAuth.js
state = generateState()         // ~33 chars
authUrl = buildAuthUrl(state)   // www.instagram.com/oauth/authorize, force_authentication=1,
                                // scope=instagram_business_basic,instagram_business_manage_comments
result = await InAppBrowser.openAuth(authUrl, 'com.instagrowth://auth', { ephemeralWebSession:true, forceCloseOnRedirection:true })
// backend /auth/done bounces Custom Tab to com.instagrowth://auth?ok=1&sid=<state>
sid = params.get('sid') || state
token = await fetch(`${API_URL}/auth/instagram/status?session_id=${sid}&device_id=${deviceId}`) → .token
```

### Plan A Verification — Rebuilt 2026-06-12
The old API verification was structurally broken (called nonexistent `graph.facebook.com` edges
`/followers` and `/likes` with IG-login tokens). Rebuilt around what the IG API actually exposes:
- **comment** → exact verification via `graph.instagram.com/{media-id}/comments` (matches `from.id` or username)
- **follow / like** → count-delta: `POST /tasks/:id/start` records a server-side baseline
  (`followers_count` / `like_count` via owner token) in new `task_starts` table; verify requires
  `current >= baseline + verified_since + 1` (verified_since = api-verified completions after this
  user's start, so concurrent verifiers can't share one delta)
- `started_at` now server-side via task_starts (client value only legacy fallback)
- Token refresh fixed: `graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`
- Audit scheduler now audits **comments only** (only re-verifiable type)
- New scope required: `instagram_business_manage_comments` — must be enabled in Meta dashboard;
  existing tokens need re-login to get it
- Limitations (accepted): follow/like deltas are approximate (unfollow before verify, two users
  sharing deltas at exact same second); audits can't reclaim follow/like

### OAuth Return Flow — Fixed 2026-06-12
- `/auth/done` now serves an HTML page that bounces to `com.instagrowth://auth?ok=1&sid=...`
  (Custom Tab can re-enter app via existing manifest scheme filter; https redirectUrl never could)
- Mobile `openAuth` redirectUrl is now `com.instagrowth://auth`
- Auth URL: `www.instagram.com/oauth/authorize` with `force_authentication=1` (removed invalid `force_reauth`)
- Device limit now enforced at token pickup: `/auth/instagram/status?session_id&device_id`
  checks MAX_ACCOUNTS_PER_DEVICE + registers device (callback path had no device context)

### Other fixes 2026-06-12
- Alert email falls back to `OWNER_EMAIL` when `ALERT_EMAIL` unset (was: alerts never sent)
- `setMode()` manages recovery timer + failure window on every switch (manual degrade now auto-recovers)
- Audit `reclaim()` was a silent no-op on slot restore (`task_id` never selected) — fixed
- `createTask` requires `instagram_media_id` for like/comment
- API probe uses `graph.instagram.com`
- `getInstagramUserInfo` now fetches `profile_picture_url`
- PostDetailScreen uses server `delay_seconds` (was hardcoded 30s)

### Optimizations 2026-06-12 (commit `9a5bfb9`)
- **Boot migration**: server.js runs idempotent `runAdditiveMigration()` on listen
  → `task_starts` + indexes auto-created on every deploy (no manual `node src/migrate.js`).
  CLI path guarded by `require.main === module`.
- **verifyTask hot path**: task_starts + tasks + doer collapsed into ONE JOIN query (was 3).
- **Indexes**: `task_starts(user_id)`, `completions(task_id, verified_at)`.
- **Admin safety**: promote/grant/ban resolve to a single account id via `resolveTargetId()`;
  refuse on ambiguous (non-unique) username (409 AMBIGUOUS_USERNAME); accept explicit `user_id`.

### Security Audit Fixes 2026-06-13
Deep audit of full backend + verify flow. Fixed:
1. **CRITICAL — honor-mode farming bypass.** A client could skip `POST /tasks/:id/start`,
   forge `started_at`, and earn follow/like rewards with no engagement (no baseline → honor
   grant in LIVE mode, never audited). Fix: verifyTask now rejects follow/like with
   `409 MUST_START` in LIVE mode when no server-side `task_starts` row exists. Comments
   unaffected (they verify exactly without a baseline). The app already calls `/start`.
2. **HIGH — OAuth auto-return broken by CSP.** helmet() v8's default `script-src 'self'`
   blocked the `/auth/done` inline redirect script, forcing a manual tap every login. Fix:
   route-scoped relaxed CSP on that one response + `<meta http-equiv=refresh>` no-JS fallback.
3. **MEDIUM — honest commenter blamed for owner's dead token.** `verifyComment` returned
   `false` (→ hard reject) when the *owner's* token was missing. Now returns `null` → honor
   fallback in verifyTask; audit `checkValid` treats `null` as keep (only explicit `false`
   reclaims), so a missing owner token never wrongly reclaims a doer's coins.
4. **Cleanup**: removed dead `INSTA_REWARDS`/`INSTA_SLOT_COSTS` from config (stale; live values
   are in app_settings), removed unused `nodemailer` dep, deleted unused `InstagramAuthModal.jsx`.
5. **Owner bootstrap**: `OWNER_INSTAGRAM_ID` env auto-promotes that account to owner on boot
   (admin API was otherwise inert until a manual DB edit).

**Accepted limitations (no clean fix — IG API has no follower/liker list edge):**
- follow/like verification is count-delta based: it confirms the owner's count rose, not *who*
  acted. On organically-growing accounts a user can ride someone else's follow. `verifiedSince`
  stops multiple app-users sharing one delta but not outside/organic growth. Comment campaigns
  are exactly verifiable and audited; follow/like are best-effort + velocity-capped.

**PENDING:**
1. Enable `instagram_business_manage_comments` permission in Meta app dashboard
2. Rebuild mobile app (`npx react-native run-android`) and test full login + verify flow on device
3. Set `OWNER_INSTAGRAM_ID` on Railway (or confirm your account already has role='owner')

### Known Issues
- Mobile `.env` has no `INSTAGRAM_APP_SECRET` (correct — secret stays server-side only)
- `react-native-config` reads `.env` at build time; any `.env` change requires rebuild
- `_sessions` (OAuth pickup) is in-memory — a server restart mid-login drops pending sessions
  (user just retries); would need a shared store only if scaled to >1 instance

### File Locations — Key Files
```
D:\insta\
  server.js
  src/
    app.js
    config.js                    (MAX_ACCOUNTS_PER_DEVICE, TIER constants)
    migrate.js
    controllers/
      authController.js          (signIn, instagramCallback, instagramStatus, _upsertAccount)
      userController.js          (getMe, deleteMe)
      taskController.js          (getAvailableTasks, getMyTasks, createTask, verifyTask, getPricing)
      campaignController.js      (pauseCampaign, resumeCampaign, cancelCampaign)
      accountController.js       (getMyPosts, disconnect)
      adminController.js
    routes/
      auth.js, users.js, accounts.js, tasks.js, transactions.js, admin.js
    services/
      instagramService.js        (verifyFollow, verifyLike, verifyComment, exchangeCode, getLongLived, getUserInfo)
      settingsService.js         (getSettings, getMode, recordApiFailure, recordApiSuccess, probeInstagramApi, initOnBoot)
      antiCheatService.js
      auditScheduler.js          (runAudit, startAuditScheduler — cron every 30min)
    middleware/auth.js
    db/pool.js
    utils/logger.js

D:\insta\mobile\
  .env                           (INSTAGRAM_APP_ID, API_URL)
  src/
    App.jsx
    theme.js                     (colors: bg=#0A0A0F, primary=#E1306C, surface, border, text, textSecondary)
    navigation/AppNavigator.jsx
    context/AuthContext.jsx
    context/I18nContext.jsx
    i18n/index.js                (observer pattern: initI18n, setLanguage, getCurrentLanguage, addLanguageListener, t, SUPPORTED_LANGUAGES)
    i18n/locales/                (en,fr,ar,es,pt,hi,tr,de,zh-CN,zh-TW,bn,ja,ko,ru,id).js
    services/
      instagramAuth.js           (initiateInstagramAuth, generateState, buildAuthUrl, _pollForToken)
      api.js
    components/
      LanguagePicker.jsx
      LoadingOverlay.jsx
    screens/
      LoginScreen.jsx, FeedScreen.jsx, PostDetailScreen.jsx,
      CreateCampaignScreen.jsx, MyCampaignsScreen.jsx,
      ProfileScreen.jsx, AdminScreen.jsx, OnboardingScreen.jsx
```
