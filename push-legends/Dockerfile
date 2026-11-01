# Push Legends: the game and its friend/login server in one container.
# Build:  docker build -t push-legends .      Run:  docker run -p 8787:8787 -v pl-data:/data push-legends
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
ENV PORT=8787 STATIC_DIR=/app/dist FRIENDS_DATA=/data/friends-data.json
VOLUME /data
EXPOSE 8787
CMD ["node", "server/main.mjs"]
