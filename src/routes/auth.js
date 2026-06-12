const { Router } = require('express');
const { signIn, instagramCallback, instagramStatus } = require('../controllers/authController');

const router = Router();
router.post('/instagram', signIn);
router.get('/instagram/callback', instagramCallback);
router.get('/instagram/status', instagramStatus);
// Hands the OAuth result back to the app. Custom Tabs can block 302s to custom
// schemes without a user gesture, so serve an auto-redirect page with a manual
// fallback link instead of a bare redirect.
router.get('/done', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  const appUrl = `com.instagrowth://auth${qs ? '?' + qs : ''}`;
  res.set('Content-Type', 'text/html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>InstaGrowth</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;background:#0A0A0F;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}
a{background:#E1306C;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;margin-top:16px}</style>
</head><body>
<p>Returning to InstaGrowth…</p>
<a href="${appUrl}">Open the app</a>
<script>window.location.replace(${JSON.stringify(appUrl)});</script>
</body></html>`);
});

module.exports = router;
