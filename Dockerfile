FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG APP_NAME
RUN npx nx build ${APP_NAME}


FROM node:22-alpine AS backend-runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=base /app/dist ./dist

ARG APP_NAME
ENV APP_NAME=${APP_NAME}

CMD ["sh", "-c", "node dist/${APP_NAME}/main.js"]


FROM nginx:alpine AS frontend-runner

COPY --from=base /app/dist/frontend /usr/share/nginx/html
COPY scripts/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]