FROM node:20-bookworm-slim

WORKDIR /app

# Prisma needs OpenSSL at runtime/build time
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
COPY design-system ./design-system
COPY samples ./samples

RUN npm run build

EXPOSE 3000

CMD ["sh","-lc","npx prisma migrate deploy && node dist/main.js"]
