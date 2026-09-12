const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Variable d'environnement manquante : ${name}. Copiez .env.example vers .env et renseignez-la.`
    );
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`,
  maxUploadSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 5),
  uploadsDir: path.resolve(__dirname, '../../uploads'),
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

module.exports = env;
