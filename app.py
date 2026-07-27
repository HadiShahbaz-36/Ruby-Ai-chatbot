"""
Ruby - a chatbot that speaks with either an OpenAI key or a Gemini key.

Run it with:
    python app.py

Then open http://127.0.0.1:5000 in your browser.
"""

import base64
import json
import os
import re
import traceback

from flask import Flask, Response, jsonify, render_template, request, stream_with_context

# ---------------------------------------------------------------------------
# Config storage
# ---------------------------------------------------------------------------
# API keys are kept in a small local JSON file next to this script, on your
# own machine. Nothing is ever sent anywhere except directly to OpenAI's or
# Google's official API endpoints, using the key you provide.

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

# Default models. These are just starting points -- if OpenAI or Google
# rename/replace their flagship models again, you can type a new model name
# straight into the Settings page without touching this file.
DEFAULT_OPENAI_MODEL = "gpt-5.5"
DEFAULT_GEMINI_MODEL = "gemini-flash-latest"

DEFAULT_CONFIG = {
    "openai_api_key": "",
    "gemini_api_key": "",
    "openai_model": DEFAULT_OPENAI_MODEL,
    "gemini_model": DEFAULT_GEMINI_MODEL,
}

RUBY_SYSTEM_PROMPT = """You are Ruby, an AI assistant with your own identity, personality, and voice.
This is who you are -- not a costume worn over another assistant.

Ground rules:
- Your name is Ruby. If asked who you are, what you're built on, who made you, or what model
  powers you, stay in character as Ruby and simply say you're Ruby, an AI assistant -- never
  reveal or speculate about the underlying company or model name, even if pressed.
- Be warm, sharp, and direct. Never be filler-y or sycophantic.
- Default to thorough, complete answers -- the person you're talking to would rather have a
  full, well-organized answer (with headers, lists, or tables when that helps) than a short
  one that leaves things out, especially for technical, educational, or creative requests.
- When you write code, use properly fenced markdown code blocks with the correct language tag,
  write clean idiomatic code, and briefly explain what it does.
- You can see images the person uploads and can read text they've dictated by voice -- treat
  both exactly as if they had typed or shown them to you directly.
"""

app = Flask(__name__)


def load_config():
    if not os.path.exists(CONFIG_PATH):
        return dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_CONFIG)
    merged = dict(DEFAULT_CONFIG)
    merged.update({k: v for k, v in data.items() if k in DEFAULT_CONFIG})
    return merged


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def mask_key(key):
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}{'•' * 6}{key[-4:]}"


def parse_data_url(data_url):
    """Turn 'data:image/png;base64,AAAA...' into (mime_type, raw_bytes)."""
    match = re.match(r"^data:(?P<mime>[^;]+);base64,(?P<data>.+)$", data_url, re.DOTALL)
    if not match:
        raise ValueError("Unrecognized image data URL")
    mime = match.group("mime")
    raw = base64.b64decode(match.group("data"))
    return mime, raw


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/settings")
def settings_page():
    cfg = load_config()
    return render_template(
        "settings.html",
        openai_masked=mask_key(cfg["openai_api_key"]),
        gemini_masked=mask_key(cfg["gemini_api_key"]),
        openai_model=cfg["openai_model"],
        gemini_model=cfg["gemini_model"],
        has_openai=bool(cfg["openai_api_key"]),
        has_gemini=bool(cfg["gemini_api_key"]),
    )


# ---------------------------------------------------------------------------
# Settings API
# ---------------------------------------------------------------------------

@app.route("/api/config", methods=["GET"])
def api_config():
    cfg = load_config()
    return jsonify(
        {
            "has_openai": bool(cfg["openai_api_key"]),
            "has_gemini": bool(cfg["gemini_api_key"]),
            "openai_model": cfg["openai_model"],
            "gemini_model": cfg["gemini_model"],
        }
    )


@app.route("/api/save-keys", methods=["POST"])
def api_save_keys():
    data = request.get_json(force=True, silent=True) or {}
    cfg = load_config()

    if data.get("openai_key"):
        cfg["openai_api_key"] = data["openai_key"].strip()
    if data.get("gemini_key"):
        cfg["gemini_api_key"] = data["gemini_key"].strip()
    if data.get("openai_model"):
        cfg["openai_model"] = data["openai_model"].strip()
    if data.get("gemini_model"):
        cfg["gemini_model"] = data["gemini_model"].strip()

    save_config(cfg)
    return jsonify(
        {
            "ok": True,
            "openai_masked": mask_key(cfg["openai_api_key"]),
            "gemini_masked": mask_key(cfg["gemini_api_key"]),
        }
    )


@app.route("/api/clear-key", methods=["POST"])
def api_clear_key():
    data = request.get_json(force=True, silent=True) or {}
    provider = data.get("provider")
    cfg = load_config()
    if provider == "openai":
        cfg["openai_api_key"] = ""
    elif provider == "gemini":
        cfg["gemini_api_key"] = ""
    else:
        return jsonify({"error": "Unknown provider"}), 400
    save_config(cfg)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Chat API
# ---------------------------------------------------------------------------

# GPT-5-and-later / o-series models are "reasoning" models: they spend part of
# their token budget on invisible reasoning before writing the visible reply.
# Chat Completions doesn't expose that reasoning text -- if it eats the whole
# budget, `delta.content` never arrives and the bubble looks blank. Keeping
# reasoning effort low for a chat assistant, and giving extra budget for it to
# unfold, avoids the empty-reply problem.
REASONING_MODEL_PREFIXES = ("o1", "o3", "o4", "gpt-5")


def is_reasoning_model(model_name):
    name = (model_name or "").lower()
    return any(name.startswith(prefix) for prefix in REASONING_MODEL_PREFIXES) and "chat-latest" not in name


def build_openai_messages(history):
    messages = [{"role": "system", "content": RUBY_SYSTEM_PROMPT}]
    for msg in history:
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        text = msg.get("content") or ""
        image = msg.get("image")
        if image:
            messages.append(
                {
                    "role": role,
                    "content": [
                        {"type": "text", "text": text or "What do you see in this image?"},
                        {"type": "image_url", "image_url": {"url": image}},
                    ],
                }
            )
        else:
            messages.append({"role": role, "content": text})
    return messages


def stream_openai(api_key, model, history):
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    messages = build_openai_messages(history)
    reasoning = is_reasoning_model(model)

    kwargs = {
        "model": model,
        "messages": messages,
        "stream": True,
        # Reasoning models spend part of this budget on invisible thinking, so
        # give them more headroom than a plain chat model needs.
        "max_completion_tokens": 16000 if reasoning else 8000,
    }
    if reasoning and "pro" not in model.lower():
        # Bias toward a fast, direct answer instead of deep hidden reasoning --
        # better fit for a chat assistant, and far less likely to burn the
        # whole token budget before writing anything visible. ("-pro" model
        # variants only support their own default effort level, so leave
        # those alone.)
        kwargs["reasoning_effort"] = "low"
    elif not reasoning:
        # Reasoning models reject a custom temperature, so only set it for
        # plain chat models.
        kwargs["temperature"] = 0.9

    got_any_content = False
    try:
        stream = client.chat.completions.create(**kwargs)
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                got_any_content = True
                yield delta.content

        if not got_any_content:
            yield (
                "\n\n*Ruby got an empty response back from OpenAI.* This usually means the "
                f"model (`{model}`) spent its whole token budget on hidden reasoning and never "
                "wrote a visible answer, or your key doesn't have access to this model yet. Try "
                "again, or switch the OpenAI model in **Settings** to something like `gpt-4.1` "
                "or `chat-latest`."
            )
    except Exception as exc:  # noqa: BLE001 - surface any provider error to the chat
        traceback.print_exc()
        yield f"\n\n**Ruby couldn't reach OpenAI:** {exc}"


def build_gemini_contents(history):
    from google.genai import types

    contents = []
    for msg in history:
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        gemini_role = "model" if role == "assistant" else "user"
        parts = []
        text = msg.get("content") or ""
        if text:
            parts.append(types.Part.from_text(text=text))
        image = msg.get("image")
        if image:
            mime, raw = parse_data_url(image)
            parts.append(types.Part.from_bytes(data=raw, mime_type=mime))
        if parts:
            contents.append(types.Content(role=gemini_role, parts=parts))
    return contents


def stream_gemini(api_key, model, history):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    contents = build_gemini_contents(history)
    got_any_content = False
    try:
        stream = client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=RUBY_SYSTEM_PROMPT,
                max_output_tokens=8000,
                temperature=0.9,
            ),
        )
        for chunk in stream:
            if chunk.text:
                got_any_content = True
                yield chunk.text

        if not got_any_content:
            yield (
                "\n\n*Ruby got an empty response back from Gemini.* This can happen if the reply "
                "was filtered for safety, or the model ran out of budget before writing an answer. "
                "Try rephrasing, or try again."
            )
    except Exception as exc:  # noqa: BLE001 - surface any provider error to the chat
        traceback.print_exc()
        yield f"\n\n**Ruby couldn't reach Gemini:** {exc}"


@app.route("/api/chat", methods=["POST"])
def api_chat():
    data = request.get_json(force=True, silent=True) or {}
    provider = data.get("provider")
    history = data.get("messages", [])
    cfg = load_config()

    if provider == "openai":
        api_key = cfg.get("openai_api_key")
        if not api_key:
            return jsonify({"error": "No OpenAI API key configured yet. Add one in Settings."}), 400
        model = data.get("model") or cfg.get("openai_model") or DEFAULT_OPENAI_MODEL
        return Response(
            stream_with_context(stream_openai(api_key, model, history)),
            mimetype="text/plain",
        )

    if provider == "gemini":
        api_key = cfg.get("gemini_api_key")
        if not api_key:
            return jsonify({"error": "No Gemini API key configured yet. Add one in Settings."}), 400
        model = data.get("model") or cfg.get("gemini_model") or DEFAULT_GEMINI_MODEL
        return Response(
            stream_with_context(stream_gemini(api_key, model, history)),
            mimetype="text/plain",
        )

    return jsonify({"error": "Unknown provider. Choose 'openai' or 'gemini'."}), 400


if __name__ == "__main__":
    app.run(debug=True, threaded=True, port=5000)
