const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const env = require('./config/env');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimit');

const app = express();

// Derriere un proxy (deploiement), pour que le rate limiting voie la vraie IP.
app.set('trust proxy', 1);

app.use(
  helmet({
    // Les images produits sont chargees depuis un autre port en developpement.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: env.frontendUrl.split(',').map((origin) => origin.trim()),
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// Images des produits et logos
app.use('/uploads', express.static(env.uploadsDir, { maxAge: '7d' }));

app.use('/api', globalLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
