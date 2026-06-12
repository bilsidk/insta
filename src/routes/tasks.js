const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getAvailableTasks, getMyTasks, createTask, verifyTask, getPricing } = require('../controllers/taskController');
const { pauseCampaign, resumeCampaign, cancelCampaign } = require('../controllers/campaignController');

const router = Router();
router.get('/pricing', authenticate, getPricing);
router.get('/',       authenticate, getAvailableTasks);
router.get('/my',     authenticate, getMyTasks);
router.post('/',      authenticate, createTask);
router.post('/:id/verify', authenticate, verifyTask);
router.patch('/:id/pause',  authenticate, pauseCampaign);
router.patch('/:id/resume', authenticate, resumeCampaign);
router.patch('/:id/cancel', authenticate, cancelCampaign);

module.exports = router;
