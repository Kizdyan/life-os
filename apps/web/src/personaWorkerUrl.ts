const port = import.meta.env.VITE_PERSONA_WORKER_PORT;
export const personaWorkerUrl = "http://127.0.0.1:" + (/^[1-9][0-9]{0,4}$/.test(port ?? "") && Number(port) <= 65535 ? port : "47832");
