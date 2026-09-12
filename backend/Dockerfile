# ---------------------------------------------------------------------------
# API + Socket.IO du menu digital
#
# Ce Dockerfile fonctionne tel quel sur Render, Railway, Fly.io, Clever Cloud
# ou n'importe quel VPS. Il ne convient PAS a Vercel : l'application a besoin
# d'un processus Node persistant pour maintenir les connexions Socket.IO.
# ---------------------------------------------------------------------------

FROM node:20-alpine

WORKDIR /app

# Dependances (couche mise en cache tant que package*.json ne change pas)
COPY package*.json ./
RUN npm ci --omit=dev

# Client Prisma : genere a partir du schema
COPY prisma ./prisma
RUN npx prisma generate

# Code applicatif
COPY src ./src

# Les images des produits doivent etre stockees sur un volume persistant,
# sinon elles disparaissent a chaque redeploiement.
RUN mkdir -p uploads/products
VOLUME ["/app/uploads"]

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Applique les migrations en attente avant de demarrer l'API.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
