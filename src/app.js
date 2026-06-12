const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes        = require('./routes/auth');
const userRoutes        = require('./routes/users');
const accountRoutes     = require('./routes/accounts');
const taskRoutes        = require('./routes/tasks');
const transactionRoutes = require('./routes/transactions');
const adminRoutes       = require('./routes/admin');
const { errorHandler }  = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));

app.use(express.json({ limit: '10kb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many sign-in attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const campaignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many campaigns created' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many admin requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/auth',         authLimiter,    authRoutes);
app.use('/users',                        userRoutes);
app.use('/accounts',                     accountRoutes);
app.use('/tasks',        campaignLimiter, taskRoutes);
app.use('/transactions',                 transactionRoutes);
app.use('/admin',        adminLimiter,   adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;