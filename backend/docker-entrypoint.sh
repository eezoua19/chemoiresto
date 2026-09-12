#!/bin/sh
# Demarrage de l'API en production.
#
# Chaque phase est annoncee AVANT d'etre executee : si le conteneur meurt ou se
# bloque, la derniere ligne des logs indique exactement ou. Sans cela, un echec
# au demarrage ne laisse aucune trace et le healthcheck echoue sans explication.

echo "[BOOT] node $(node -v) | PORT=${PORT:-<non injecte, repli sur 4000>}"
echo "[BOOT] NODE_ENV=${NODE_ENV} | FRONTEND_URL=${FRONTEND_URL:-<non defini>}"

echo "[BOOT] application des migrations..."
if ./node_modules/.bin/prisma migrate deploy; then
  echo "[BOOT] migrations OK"
else
  echo "[BOOT] ECHEC des migrations (code $?)" >&2
  exit 1
fi

echo "[BOOT] demarrage du serveur Node..."
exec node src/server.js
