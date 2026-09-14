FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SHOW_DEMO_LOGIN=false
ARG API_ORIGIN=http://api:8000
ENV NEXT_PUBLIC_SHOW_DEMO_LOGIN=$NEXT_PUBLIC_SHOW_DEMO_LOGIN API_ORIGIN=$API_ORIGIN NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S faldo && adduser -S faldo -G faldo
COPY --from=build /app/public ./public
COPY --from=build --chown=faldo:faldo /app/.next/standalone ./
COPY --from=build --chown=faldo:faldo /app/.next/static ./.next/static
USER faldo
EXPOSE 3000
CMD ["node", "server.js"]
