# ==========================================
# Estágio 1: Dependências de Produção
# ==========================================
FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

# ==========================================
# Estágio 2: Runner da Aplicação
# ==========================================
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Cria usuário não-root por segurança
RUN addgroup -S flowbridge && adduser -S flowbridge -G flowbridge

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER flowbridge

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
