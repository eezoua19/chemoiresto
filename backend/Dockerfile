# ---------------------------------------------------------------------------
# API + Socket.IO du menu digital
#
# Ce Dockerfile fonctionne sur Railway, Render, Fly.io, Clever Cloud ou un VPS.
# Il ne convient PAS a Vercel : l'application a besoin d'un processus Node
# persistant pour maintenir les connexions Socket.IO.
#
# Base Debian (slim) et non Alpine : le moteur Prisma est compile contre
# glibc/OpenSSL. Sur Alpine (musl) il echoue au demarrage avec
# "Prisma failed to detect the libssl/openssl version to use".
# ---------------------------------------------------------------------------

FROM node:20-slim

# OpenSSL est requis par le moteur Prisma.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependances (couche mise en cache tant que package*.json ne change pas)
COPY package*.json ./
RUN npm ci --omit=dev

# Client Prisma : genere a partir du schema.
# Prisma est une dependance de production, le binaire est donc local :
# aucun telechargement reseau au build ni au demarrage.
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# Code applicatif
COPY src ./src

# Les images des produits doivent etre stockees sur un volume persistant,
# sinon elles disparaissent a chaque redeploiement.
#
# On declare seulement le dossier : PAS d'instruction VOLUME. Railway rejette
# les volumes Docker ("docker VOLUME is not supported, use Railway Volumes")
# et le montage se configure cote plateforme, sur /app/uploads.
RUN mkdir -p uploads/products

ENV NODE_ENV=production

# PORT n'est volontairement pas fige : l'hebergeur l'injecte et
# src/config/env.js retombe sur 4000 en local.
EXPOSE 4000

# Applique les migrations en attente avant de demarrer l'API.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node src/server.js"]
