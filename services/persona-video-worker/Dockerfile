FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/persona-video-worker/server.mjs ./server.mjs
ENV NODE_ENV=production PORT=8080 PERSONA_WORKER_DATA=/tmp/persona-video-worker
EXPOSE 8080
USER node
CMD ["node","server.mjs"]
