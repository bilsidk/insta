module.exports = {
  OWNER_EMAIL: (process.env.OWNER_EMAIL || '').toLowerCase(),

  INSTA_REWARDS: {
    follow:  5,
    like:    3,
    comment: 6,
  },

  INSTA_SLOT_COSTS: {
    follow:  8,
    like:    5,
    comment: 9,
  },

  TIER: { OWNER: 1, PREMIUM: 2, USER: 3 },

  MIN_SECONDS_BETWEEN_TASKS: 20,
  MAX_TASKS_PER_HOUR: 40,
  MAX_ACCOUNTS_PER_DEVICE: 3,
  RECLAIMS_BEFORE_BAN: 3,
  TRUST_FLOOR_BAN: 25,
  TRUST_PENALTY: 15,
};
