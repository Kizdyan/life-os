"""Bounded, server-side multimodal requests with quota-only failover."""
import base64
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

DEFAULT_OPENAI = "gpt-4.1-mini"
DEFAULT_GEMINI = "gemini-3.5-flash-lite"
DEFAULT_OLLAMA_VISION = "qwen3-vl:2b-instruct"
DEFAULT_OPENROUTER_VISION = "nvidia/nemotron-3.5-super-vl:free"
DEFAULT_OPENROUTER_AUDIO = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
OLLAMA_VISION_URL = "http://127.0.0.1:11434/api/generate"
QUOTA_CODES = {"insufficient_quota", "billing_hard_limit_reached", "organization_usage_limit_exceeded", "billing_not_active"}


class ProviderError(RuntimeError):
    def __init__(self, provider, status, code):
        self.provider, self.status, self.code = provider, status, code
        super().__init__(f"{provider}: {code} ({status})")


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_local_env():
    path = Path(__file__).resolve().parents[1] / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = re.fullmatch(
            r"\s*(OPENAI_API_KEY|GEMINI_API_KEY|PERSONA_STUDIO_OPENAI_MODEL|PERSONA_STUDIO_GEMINI_MODEL|"
            r"OPENROUTER_API_KEY|PERSONA_STUDIO_OPENROUTER_MODEL|PERSONA_STUDIO_OLLAMA_VISION_MODEL|"
            r"PERSONA_MEDIA_FFMPEG_DIR|PERSONA_STUDIO_REFERENCE_DIR)\s*=\s*(.*?)\s*", line
        )
        if match and match[2] and not os.environ.get(match[1]):
            os.environ[match[1]] = match[2].strip("'\u0022")


def _post(provider, url, headers, payload):
    request = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", **headers})
    try:
        opener = build_opener(ProxyHandler({}), NoRedirects()) if provider == "ollama" else build_opener(NoRedirects())
        with opener.open(request, timeout=300 if provider == "ollama" else 65) as response:
            return json.loads(response.read(2_000_000))
    except HTTPError as error:
        try:
            detail = json.loads(error.read(64000)).get("error", {})
        except (ValueError, AttributeError):
            detail = {}
        if not isinstance(detail, dict):
            detail = {}
        code = "http_error"
        reasons = [entry.get("reason") for entry in detail.get("details", []) if isinstance(entry, dict)]
        for value in (detail.get("code"), detail.get("type"), *reasons, detail.get("status")):
            if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value):
                code = value
                break
        raise ProviderError(provider, error.code, code) from None
    except (URLError, TimeoutError, OSError):
        raise ProviderError(provider, 0, "network_unavailable") from None


def _encoded(frames):
    return [base64.b64encode(frame).decode("ascii") for frame in frames]


def _ollama_vision(model, prompt, frames, schema):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}", model) or "cloud" in model.lower():
        raise ValueError("Choose a local Ollama vision model")
    response = _post("ollama", OLLAMA_VISION_URL, {}, {
        "model": model, "prompt": prompt, "images": _encoded(frames), "format": schema,
        "stream": False, "think": False, "keep_alive": 0,
        "options": {"temperature": 0.1, "num_ctx": 8192, "num_predict": 700},
    })
    if response.get("done") is not True or response.get("done_reason") != "stop":
        raise ProviderError("ollama", 200, "incomplete_generation")
    return json.loads(response["response"])


def _openai(key, model, prompt, frames, schema):
    content = [{"type": "input_text", "text": prompt}]
    content.extend({"type": "input_image", "image_url": "data:image/jpeg;base64," + image, "detail": "low"}
                   for image in _encoded(frames))
    data = _post("openai", "https://api.openai.com/v1/responses", {"Authorization": "Bearer " + key},
                 {"model": model, "store": False, "input": [{"role": "user", "content": content}],
                  "max_output_tokens": 900, "text": {"format": {"type": "json_schema", "name": "persona_result",
                                                                "schema": schema, "strict": True}}})
    parts = [part for item in data.get("output", []) for part in item.get("content", [])]
    if data.get("status") != "completed" or any(part.get("type") == "refusal" for part in parts):
        raise ProviderError("openai", 200, "incomplete_or_refused")
    return json.loads("".join(part["text"] for part in parts if part.get("type") == "output_text"))


def _gemini(key, model, prompt, frames, schema):
    parts = [{"text": prompt}]
    parts.extend({"inline_data": {"mime_type": "image/jpeg", "data": image}} for image in _encoded(frames))
    generation = {"responseMimeType": "application/json", "responseJsonSchema": schema, "maxOutputTokens": 1200}
    if model.startswith("gemini-2.5-flash"):
        generation["thinkingConfig"] = {"thinkingBudget": 0}
    data = _post("gemini", f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                 {"x-goog-api-key": key}, {"contents": [{"role": "user", "parts": parts}],
                  "generationConfig": generation})
    candidate = next(iter(data.get("candidates", [])), {})
    if candidate.get("finishReason") != "STOP":
        raise ProviderError("gemini", 200, "incomplete_or_refused")
    return json.loads("".join(part["text"] for part in candidate["content"]["parts"] if "text" in part))


def _openrouter(key, model, prompt, frames, schema, *, audio=()):
    content = [{"type": "text", "text": prompt + "\nВерни только JSON по схеме: " + json.dumps(schema)}]
    content.extend({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + image}} for image in _encoded(frames))
    content.extend({"type": "input_audio", "input_audio": {"data": sample, "format": "wav"}}
                   for sample in _encoded(audio))
    payload = {"model": model, "messages": [{"role": "user", "content": content}],
               "max_tokens": 4096, "temperature": 0.1, "stream": False,
               "reasoning": {"effort": "low", "exclude": True},
               "provider": {"require_parameters": True,
                            "max_price": {"prompt": 0, "completion": 0, "image": 0, "request": 0}}}
    if audio:
        payload["provider"]["max_price"]["audio"] = 0
    else:
        payload["response_format"] = {"type": "json_object"}
    response = _post("openrouter", "https://openrouter.ai/api/v1/chat/completions",
                     {"Authorization": "Bearer " + key}, payload)
    choice = next(iter(response.get("choices") or []), {})
    message = choice.get("message") or {}
    if choice.get("finish_reason") != "stop" or message.get("refusal") or not message.get("content"):
        raise ProviderError("openrouter", 200, "incomplete_or_refused")
    text = message["content"].strip()
    if audio and text.startswith("```json") and text.endswith("```"):
        text = text[7:-3].strip()
    return json.loads(text)


def ask_audio(prompt, samples, schema):
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Set OPENROUTER_API_KEY in the local Worker .env.local.")
    return _openrouter(key, DEFAULT_OPENROUTER_AUDIO, prompt, [], schema, audio=samples)


def ask(prompt, frames, schema, *, env=None, prefer=None):
    env = os.environ if env is None else env
    if prefer == "openrouter":
        key = env.get("OPENROUTER_API_KEY", "").strip()
        if not key:
            raise RuntimeError("Set OPENROUTER_API_KEY in the local Worker .env.local.")
        model = env.get("PERSONA_STUDIO_OPENROUTER_MODEL", "").strip() or DEFAULT_OPENROUTER_VISION
        if not re.fullmatch(r"[a-z0-9._-]+/[a-z0-9._-]+:free", model):
            raise ValueError("OpenRouter Critic requires an explicit :free model")
        return {"provider": "openrouter", "model": model, "value": _openrouter(key, model, prompt, frames, schema)}
    if prefer == "ollama":
        model = env.get("PERSONA_STUDIO_OLLAMA_VISION_MODEL") or DEFAULT_OLLAMA_VISION
        return {"provider": "ollama", "model": model, "value": _ollama_vision(model, prompt, frames, schema)}
    fallback = None
    openai_key = env.get("OPENAI_API_KEY", "").strip()
    gemini_key = env.get("GEMINI_API_KEY", "").strip()
    if openai_key and prefer != "gemini":
        model = env.get("PERSONA_STUDIO_OPENAI_MODEL") or DEFAULT_OPENAI
        try:
            return {"provider": "openai", "model": model, "value": _openai(openai_key, model, prompt, frames, schema)}
        except ProviderError as error:
            if error.status not in {402, 403, 429} or error.code not in QUOTA_CODES or not gemini_key:
                raise
            fallback = error.code
    if not gemini_key:
        raise RuntimeError("Set OPENAI_API_KEY or GEMINI_API_KEY in the local Worker .env.local.")
    model = env.get("PERSONA_STUDIO_GEMINI_MODEL") or DEFAULT_GEMINI
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", model):
        raise ValueError("Invalid Gemini model ID")
    return {"provider": "gemini", "model": model, "fallback": fallback,
            "value": _gemini(gemini_key, model, prompt, frames, schema)}
