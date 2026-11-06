# Persona: provider-independent deployment

The video worker can be run on any Linux host with Docker Compose. It does not require Vercel, Render, or GitHub Actions at runtime.

## Run

1. Provision a Linux host with enough CPU, RAM, storage, and bandwidth for the expected footage.
2. Generate a private token (32+ random characters) and set PERSONA_WORKER_TOKEN in the host environment; never embed it in the browser.
3. From the repository root run:
   `docker compose -f compose.persona-video.yaml up -d --build`
4. Check `curl http://127.0.0.1:8080/health`.
5. Put a trusted authenticated backend or reverse proxy in front of the worker before any remote use. The compose file binds the worker to loopback only.

## Portability and limitations

- Docker volumes keep input/output files across container recreation on the same host, but do not automatically replicate them to another server.
- The current job registry and queue are in memory: a process restart still loses job metadata. A durable job database and object storage are required before production.
- The worker accepts direct raw uploads and does not yet support browser-safe signed upload URLs.
- The service is not a full montage pipeline and is not connected to the Persona UI.
- A VPS has capacity limits and a monthly cost; this setup avoids vendor-specific build quotas but does not provide unlimited resources.
- Add external backups, health monitoring, access control, TLS, durable jobs, object storage, and a deployment rollback strategy before public rollout.
