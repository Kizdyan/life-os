# Persona cloud video worker (prototype)

An isolated Node.js + FFmpeg service for CPU transcoding, with an authenticated API and a single-job queue. This is **not yet integrated with the Persona UI**, and it is **not a production deployment**.

## Deployment

Build the Dockerfile from the repository root. Configure a Render **Web Service** with the Docker runtime and the path `services/persona-video-worker/Dockerfile`. Supply `PERSONA_WORKER_TOKEN` as a secret with at least 32 random characters. Set a persistent data directory before using real user footage; the default `/tmp` directory is ephemeral. A service plan, spending limit and storage policy must be approved before provisioning.

Do not place `PERSONA_WORKER_TOKEN` in browser code, Vite environment variables or public JavaScript. Only a trusted server-side API should call this service. Never expose the worker to direct browser uploads with a long-lived bearer token.

## API

- `GET /health`: non-sensitive health check.
- `POST /jobs?preset=natural|warm|neutral`: raw video request body, bearer token, mandatory `Content-Length`, maximum 500 MiB by default; returns HTTP 202 and a job ID.
- `GET /jobs/:id`: bearer token, status `queued`, `processing`, `completed`, or `failed`.
- `GET /jobs/:id/output`: bearer token; MP4 download after completion.

The initial render uses H.264 CRF 19, AAC 192 kb/s, yuv420p, and faststart. It preserves audio if present, and rejects unknown presets. Presets here are preliminary and **not guaranteed to match the project's approved color pipeline**.

## Important limitations before production

- Job metadata and queue are in memory; process restarts lose job state.
- Input/output files need durable object storage, expiry/retention controls and garbage collection.
- Upload should be moved to signed object-storage URLs and a trusted API with per-user authorization.
- Add rate limits, per-user quotas, idempotency, virus/content validation, request cancellation, retry handling and FFmpeg execution timeouts.
- Do not claim end-to-end video editing, AI QA, learning, or publishing based on this worker. The UI integration and real-device end-to-end tests remain to be implemented.
