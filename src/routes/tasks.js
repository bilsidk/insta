const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { getAvailableTasks, getMyTasks, createTask, startTask, verifyTask, getPricing } = require('../controllers/taskController');
const { pauseCampaign, resumeCampaign, cancelCampaign } = require('../controllers/campaignController');

const campaignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many campaigns created' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();
router.get('/pricing', authenticate, getPricing);
router.get('/',        authenticate, getAvailableTasks);
router.get('/my',      authenticate, getMyTasks);
router.post('/',       authenticate, campaignLimiter, createTask);
router.post('/:id/start',    authenticate, startTask);
router.post('/:id/verify',   authenticate, verifyTask);
router.patch('/:id/pause',   authenticate, pauseCampaign);
router.patch('/:id/resume',  authenticate, resumeCampaign);
router.patch('/:id/cancel',  authenticate, cancelCampaign);

module.exports = router;
