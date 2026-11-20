# Builds the SPA and runs the Birta API + static server on one origin.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps && npm install tsx --legacy-peer-deps
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/lib ./src/lib
COPY src/types ./src/types
COPY firebase-applet-config.json ./
USER node
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
