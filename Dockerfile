FROM node:22-alpine AS base

WORKDIR /app

COPY . .
RUN npm ci

ARG APP_NAME
RUN npx nx build ${APP_NAME}


FROM node:22-alpine AS backend-runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY call-requests-service/package.json ./call-requests-service/
COPY scheduler-service/package.json ./scheduler-service/
COPY communication-service/package.json ./communication-service/
RUN npm ci --omit=dev

ARG APP_NAME
COPY --from=base /app/${APP_NAME}/dist ./${APP_NAME}/dist
COPY --from=base /app/packages/shared-types/dist ./packages/shared-types/dist
ENV APP_NAME=${APP_NAME}

CMD ["sh", "-c", "node ${APP_NAME}/dist/main.js"]


FROM nginx:alpine AS frontend-runner

COPY --from=base /app/dist/frontend /usr/share/nginx/html
COPY scripts/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]