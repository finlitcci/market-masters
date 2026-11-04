# NOTE: written but not built or tested in the environment where this project was created.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3001 DB_FILE=/data/market-masters.db TRUST_PROXY=1
VOLUME /data
EXPOSE 3001
CMD ["node", "server/index.js"]
