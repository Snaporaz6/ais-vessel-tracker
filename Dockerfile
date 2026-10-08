FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared ./shared
COPY api ./api
COPY ingestor ./ingestor
COPY server ./server
COPY storage ./storage
COPY scripts ./scripts
COPY tests ./tests
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production STORAGE_DIR=/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Railway gestisce il mount persistente /data; una sola replica.
CMD ["node", "dist/server/index.js"]
