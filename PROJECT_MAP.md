# InstaGrowth — Project Map

> Generated: 2026-06-08 | Tech Lead: Bilel Benaoun

---

## [TECH_STACK]

| Layer | Tech | Version |
|-------|------|---------|
| **Runtime** | Node.js | 24.16.0 |
| **Backend** | Express | 4.21.x |
| **Database** | PostgreSQL (NeonDB) | via `pg` 8.21 |
| **Auth** | JWT (jsonwebtoken) | 9.0.3 |
| **IG API** | Instagram Graph API v22.0 | `axios` 1.17 |
| **Mobile** | React Native | 0.85.3 |
| **Nav** | React Navigation | 7.x |
| **OAuth** | react-native-app-auth | 8.x |
| **Storage** | @react-native-async-storage | 3.x |
| **Scheduler** | node-cron | 4.x |
| **Rate-Limit** | express-rate-limit | 8.x |
| **Security** | helmet, express-rate-limit | — |
| **Logging** | Custom JSON logger (sync) | — |

### Deprecation Notes
- Instagram Basic Display API **deprecated Dec 2024** — we use Graph API exclusively
- Express 5.2.1 is latest stable but we're on 4.x (stable, well-tested)

---

## [SYSTEM_FLOW]

### User Journey

```
[Login Screen]
    |
    v
[Instagram OAuth] --> [POST /auth/instagram] --> [JWT issued]
    |
    v
[Feed Screen]
    |-- Browse tasks (follow/like/comment)
    |-- Filter by type
    |-- Tap card --> [PostDetail]
    |       |-- "Open in Instagram"
    |       |-- "Verify & Earn" --> [POST /tasks/:id/verify]
    |       |       |-- Backend: Instagram Graph API check
    |       |       |-- Success: coins awarded
    |
    |-- "Create Campaign" --> [CreateCampaign]
    |       |-- Select type (follow/like/comment)
    |       |-- Set slots, pick post
    |       |-- Cost: coins deducted
    |       |-- Creates task rows
    |
    |-- "My Campaigns" --> [MyCampaigns]
    |       |-- View/pause/resume/cancel
    |
    |-- "Profile" --> [Profile]
            |-- Stats, coins
            |-- My Campaigns
            |-- Admin Panel (if admin)
            |-- Disconnect / Delete account
```

### Data Flow: Task Verification

```
User taps "Verify"
    -> POST /tasks/:id/verify
    -> antiCheatService: check ban + rate-limit
    -> instagramService:
         follow  -> GET /{ownerId}/followers?limit=200 (paginated, up to 10 pages)
         like    -> GET /{mediaId}/likes?limit=200
         comment -> GET /{mediaId}/comments?limit=200
    -> If found: INSERT completion, credit coins, decrement slot
    -> If slots=0: mark task completed
```

---

## [ARCHITECTURE]

### Backend Structure

```
D:\insta\
  server.js                  # Entry: dotenv + app + scheduler
  src/
    app.js                   # Express app: middleware, routes, error handler
    migrate.js               # Schema migration (idempotent)
    config/
      index.js               # Rewards/costs/constants
    db/
      pool.js                # PG Pool (NeonDB with SSL)
    middleware/
      auth.js                # JWT verification middleware
      errorHandler.js        # Centralized error handler
    routes/
      auth.js                # POST /auth/instagram
      users.js               # GET/DELETE /users/me
      accounts.js            # GET /accounts/posts, POST /accounts/disconnect
      tasks.js               # GET /tasks, POST /tasks, PATCH /tasks/:id/...
      transactions.js        # GET /transactions
      admin.js               # Admin CRUD + mode control
    controllers/
      authController.js      # Instagram OAuth code exchange + JWT issue
      userController.js      # Profile read/delete
      accountController.js   # Instagram account management
      taskController.js      # Task CRUD + verification
      campaignController.js  # Campaign pause/resume/cancel
      transactionController.js
      adminController.js     # Settings, stats, promote
    services/
      instagramService.js    # Graph API calls (verify follow/like/comment, token mgmt)
      antiCheatService.js    # Ban/velocity/trust checks
      settingsService.js     # DB-backed app settings
      auditScheduler.js      # Periodic token refresh + stale task cleanup
    utils/
      logger.js              # JSON structured logger
```

### Mobile Structure

```
D:\insta\mobile\
  src/
    App.jsx                         # Root: SafeArea + I18nProvider + AuthProvider + Navigation
    theme.js                        # colors, spacing, borderRadius
    i18n/
      index.js                      # t(), locale detection, LANGUAGES
      locales/                      # en.json, ar.json, fr.json, es.json
    context/
      AuthContext.jsx               # JWT storage, signIn/signOut, user state
      I18nContext.jsx               # Language state, t() wrapper, AsyncStorage persistence
    navigation/
      AppNavigator.jsx              # Stack: Login | Feed, PostDetail, CreateCampaign, MyCampaigns, Profile, Admin
    screens/
      LoginScreen.jsx               # Instagram OAuth login
      FeedScreen.jsx                # Task feed with filters + campaign buttons
      PostDetailScreen.jsx          # Task detail with verify flow
      CreateCampaignScreen.jsx      # Campaign creation form
      MyCampaignsScreen.jsx         # Campaign management list
      ProfileScreen.jsx             # User profile + settings
      AdminScreen.jsx               # Admin settings & stats
    components/
      PostCard.jsx                  # Task card in feed
      CoinsDisplay.jsx              # Coin balance badge
      LoadingOverlay.jsx            # Full-screen loading
      LanguagePicker.jsx            # Language selector bottom sheet
    services/
      api.js                        # HTTP client (token injection, error handling)
      instagramAuth.js              # AppAuth config for Instagram OAuth
```

### Database Schema (6 tables)

```
users                          instagram_accounts
  id PK                         id PK
  email                         user_id FK -> users(id) UNIQUE
  name                          instagram_user_id UNIQUE
  avatar                        username
  coins                         account_type
  role                          profile_pic_url
  is_premium                    access_token
  is_banned                     refresh_token
  ban_reason                    token_expiry
  last_task_at                  is_active
  device_id
  reclaim_count           tasks
  trust_score            id PK
  banned_at              user_id FK -> users(id)
  created_at             account_id FK -> instagram_accounts(id)
                         task_type
  completions            target_instagram_user_id
  id PK                  instagram_media_id
  task_id FK             instagram_media_thumbnail
  user_id FK             instagram_media_permalink
  instagram_user_id      instagram_media_caption
  verified_at            reward
  completed_at           remaining_slots
  UNIQUE(task_id,user_id) total_slots
                         status
  transactions           owner_tier
  id PK                  created_at
  user_id FK
  amount            app_settings
  type              id PK DEFAULT 1
  description       api_mode
  created_at        degraded_reason
                    settings JSONB
  device_accounts   updated_at
  id PK
  device_id
  user_id FK
  UNIQUE(device_id,user_id)
```

---

## [ORPHANS & PENDING]

### P1 — Must Fix / Ship
| Item | Status | Notes |
|------|--------|-------|
| **Instagram App credentials** | 🔴 Blocked | FB account suspended — waiting on reactivation |
| **Mobile env vars for IG creds** | 🟡 Prepped | `react-native-config` installed, `.env` created, `instagramAuth.js` still uses `process.env` — needs rewrite to use `react-native-config` once creds are ready |
| **Token refresh** | ✅ Fixed | `authController.js` now stores `refresh_token`; `instagramService.js` falls back to `access_token` if null |
| **Stripe API keys** | 🔴 Blocked | Backend + mobile code ready — needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` |
| **Health endpoint** | ✅ Done | `GET /health` returns ok |

### P2 — Should Have
| Item | Status | Notes |
|------|--------|-------|
| **Input sanitization** | ✅ Done | Campaign free-text fields sanitized in `taskController.js` |
| **Dead code removed** | ✅ Done | `assertDeviceOk`/`registerDevice` deleted from `antiCheatService.js` |
| **Orphaned App.tsx** | ✅ Done | Deleted |
| **Redundant rate limiter** | ✅ Done | `verifyLimiter` standalone mount removed from `app.js` |
| **Push notifications** | ⚪ Not started | For task completion / campaign done |
| **Error reporting (Sentry)** | ⚪ Not started | Catch crashes in production |

### P3 — Nice to Have
| Item | Status | Notes |
|------|--------|-------|
| **Binance Pay alternative** | ⚪ Future | After Stripe is live |
| **Dark mode** | ⚪ Future | Would need theme context |
| **Leaderboard / gamification** | ⚪ Future | Rewards for top earners |
| **Referral system** | ⚪ Future | Invite friend → bonus coins |

---

## [MILESTONES]

### M1: Auth Unlocked (⏳ waiting on Facebook account reactivation)
- [x] Android intent filter for `com.instagrowth://oauthredirect` — already in manifest
- [ ] User provides App ID + Secret
- [ ] Wire into `.env` + mobile `react-native-config`
- [ ] Test OAuth flow end-to-end

### M2: Payments Live (💰 in progress)
- [x] `stripe` installed on backend
- [x] `react-native-config` installed on mobile
- [x] `/payments/create-checkout` backend endpoint
- [x] Stripe webhook (`/payments/webhook`) to credit coins
- [x] `PurchaseCoinsScreen` with pack listing + Stripe Checkout redirect
- [x] "Buy Coins" button in Profile screen
- [ ] User provides `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PUBLISHABLE_KEY`

### M3: Production Hardening
- [ ] Sentry error tracking
- [ ] App signing + Play Store release
- [ ] Privacy policy + terms of service
