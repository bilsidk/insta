module.exports = {
  OWNER_EMAIL: (process.env.OWNER_EMAIL || '').toLowerCase(),

  // NOTE: rewards/slot costs are NOT defined here — they live in app_settings (DB),
  // editable from the admin panel, and are read via settingsService.getSettings().

  TIER: { OWNER: 1, PREMIUM: 2, USER: 3 },

  MIN_SECONDS_BETWEEN_TASKS: 20,
  MAX_TASKS_PER_HOUR: 40,
  MAX_ACCOUNTS_PER_DEVICE: 3,
  RECLAIMS_BEFORE_BAN: 3,
  TRUST_FLOOR_BAN: 25,
  TRUST_PENALTY: 15,
};
