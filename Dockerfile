FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG APP_NAME
RUN npx nx build ${APP_NAME}

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=base /app/dist ./dist

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

CMD ["sh", "-c", "node dist/${APP_NAME}/main.js"]