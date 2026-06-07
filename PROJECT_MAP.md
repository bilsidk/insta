# InstaGrowth — Instagram Creator Exchange

## [TECH_STACK]

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | >=18 (v24.16.0) |
| Backend | Express | ^4.21.x |
| Database | PostgreSQL | 16+ |
| DB Driver | pg | ^8.21.0 |
| Auth | Instagram OAuth + JWT | ^9.0.3 |
| API Client | axios | ^1.17.0 |
| Security | helmet, cors | ^8.2.0 / ^2.8.6 |
| Rate Limiting | express-rate-limit | ^8.5.2 |
| Scheduling | node-cron | ^4.2.1 |
| Frontend | React Native | 0.85.3 |
| Navigation | @react-navigation/native-stack | ^7.3.0 |
| Storage | @react-native-async-storage | ^2.1.2 |
| OAuth | react-native-app-auth | ^8.1.1 |

## [SYSTEM_FLOW]

```
User Flow:
  Launch App → LoginScreen (Instagram OAuth)
    → Connect Instagram account
    → FeedScreen (browse available tasks filtered by type)
      → Tap post → PostDetailScreen (follow/like/comment guide → Open Instagram)
        → Return → tap "Verify & Earn" → API checks Instagram → coins credited
    → CreateCampaignScreen (select post, task type, slots) → coins deducted
    → MyCampaignsScreen (pause/resume/cancel tracking)
    → ProfileScreen (coins, stats, logout, delete)

Admin Flow:
  AdminScreen → Toggle live/degraded mode, adjust limits, view stats

API Flow:
  POST /auth/instagram  → exchange code → JWT
  GET  /users/me        → current user + stats
  GET  /accounts/posts  → user's Instagram media
  GET  /tasks           → feed (filtered by type)
  POST /tasks           → create campaign
  POST /tasks/:id/verify → verify via Instagram Graph API
  PATCH /tasks/:id/pause|resume|cancel
  GET  /transactions    → coin history
  GET  /admin/status    → stats + settings
```

## [ARCHITECTURE]

```
D:/insta/
├── backend/
│   └── src/
│       ├── config/index.js           # INSTA_REWARDS, INSTA_SLOT_COSTS, TIER, rate limits
│       ├── controllers/
│       │   ├── authController.js      # Instagram OAuth → JWT
│       │   ├── userController.js      # GET/DELETE /users/me
│       │   ├── accountController.js   # GET posts, disconnect
│       │   ├── taskController.js      # Feed, create, verify
│       │   ├── campaignController.js  # Pause/resume/cancel + refund
│       │   ├── transactionController.js # History
│       │   └── adminController.js     # Settings, mode, promote
│       ├── db/pool.js                 # PostgreSQL pool
│       ├── middleware/
│       │   ├── auth.js                # JWT verify
│       │   └── errorHandler.js        # Centralized handler
│       ├── routes/                    # Wire controllers to Express
│       ├── services/
│       │   ├── instagramService.js    # Graph API calls (followers, likes, comments, token refresh)
│       │   ├── antiCheatService.js    # Velocity, device, reclaim
│       │   ├── settingsService.js     # DB-backed runtime settings
│       │   └── auditScheduler.js      # Delayed re-verification cron
│       ├── utils/logger.js           # Structured JSON logger
│       ├── app.js                     # Express setup + rate limiters
│       ├── server.js                  # Entry point + audit scheduler
│       ├── migrate.js                 # Schema + indexes
│       └── test-flow.sh               # Self-verification script
│
├── mobile/
│   └── src/
│       ├── screens/
│       │   ├── LoginScreen.jsx        # Instagram OAuth
│       │   ├── FeedScreen.jsx         # Task feed with filter
│       │   ├── PostDetailScreen.jsx    # Action guide + verify
│       │   ├── CreateCampaignScreen.jsx # Select post/type/slots
│       │   ├── MyCampaignsScreen.jsx   # Manage campaigns
│       │   ├── ProfileScreen.jsx       # Stats + settings
│       │   └── AdminScreen.jsx         # Runtime controls
│       ├── context/AuthContext.jsx     # Auth state + persistence
│       ├── services/api.js             # Fetch-based HTTP client
│       ├── navigation/AppNavigator.jsx # Stack navigator
│       └── components/                 # PostCard, CoinsDisplay, LoadingOverlay, ErrorBoundary
│
└── PROJECT_MAP.md
```

## [ORPHANS & PENDING]

- [x] Database schema (migrate.js) — all tables + indexes
- [x] Backend config — rewards, costs, anti-cheat constants
- [x] Backend services — Instagram API client, anti-cheat, settings, audit scheduler
- [x] Backend controllers — auth, users, accounts, tasks, campaigns, transactions, admin
- [x] Backend routes — all wired with rate limiting + auth
- [x] Backend app + server — Express initialization, CORS, helmet, logging
- [x] Backend verified — all 10 module tests pass
- [x] Frontend screens — Login, Feed, PostDetail, CreateCampaign, MyCampaigns, Profile, Admin
- [x] Frontend services — API client, Instagram auth module
- [x] Frontend context — AuthProvider with token persistence
- [x] Frontend navigation — Stack navigator with auth-gated routes
- [x] Frontend components — PostCard, CoinsDisplay, LoadingOverlay, ErrorBoundary

**To deploy:**
- [ ] Run `npm run migrate` against a PostgreSQL database
- [ ] Install mobile deps: `cd mobile && npm install`
- [ ] Generate Android native project: `npx react-native init --directory android`
- [ ] Add `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` to mobile .env
- [ ] Configure deep link for OAuth redirect in AndroidManifest.xml / Info.plist
- [ ] Build release APK: `cd android && ./gradlew assembleRelease`

## Milestone Status

| # | Milestone | Status |
|---|-----------|--------|
| M1 | Database + Config | ✅ Done |
| M2 | Auth + Instagram Connect | ✅ Done |
| M3 | Task Feed + Creation | ✅ Done |
| M4 | Verification Flow | ✅ Done |
| M5 | Campaign Management | ✅ Done |
| M6 | Frontend Auth Flow | ✅ Done |
| M7 | Frontend Core Screens | ✅ Done |
| M8 | Admin Screen | ✅ Done |
| M9 | Self-Verification | ✅ 10/10 pass |
