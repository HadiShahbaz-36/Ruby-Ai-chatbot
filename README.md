# Ruby

Ruby is a modern AI assistant built with **Flask**, **JavaScript**, and **CSS**. It supports both **OpenAI** and **Google Gemini**, lets you switch between them anytime, and includes voice input, voice narration, image analysis, markdown rendering, code highlighting, and streaming responses.

## Features

- Dual AI support: OpenAI and Gemini
- Live model switching from the chat header
- Streaming responses
- Image analysis with drag-and-drop, click upload, or clipboard paste
- Voice input using your browser microphone
- Voice output that reads Ruby’s replies aloud
- Markdown rendering with syntax-highlighted code blocks
- Copy code buttons on code blocks
- Regenerate response option
- Copy message option
- New chat button
- Dedicated Settings page for API keys and model names
- Conversation history saved locally in the browser

## Tech Stack

- Backend: Flask
- Frontend: HTML, CSS, JavaScript
- AI Providers: OpenAI, Google Gemini
- Dependencies: `openai`, `google-genai`





# Installation

## 1) Install Python

Make sure you have Python 3.10+ installed.

## 2) Install dependencies
pip install -r requirements.txt

## 3) Run the app
python app.py
Open in Browser

After running the app, open:

http://127.0.0.1:5000
API Keys

Open the Settings page in the app and add:

OpenAI API key
Gemini API key

You can use either one or both.

The keys are saved locally in config.json next to app.py.

# Notes

config.json should not be uploaded to GitHub.
Keep your API keys private and add them only inside the app settings.
Conversation history is stored in your browser’s local storage.
Voice features work best in Chrome or Edge.
If a model name changes, you can update it from the Settings page without editing code.

# DEVELOPER:
## Hadi Shahbaz


## Project Structure

```text
ruby_chatbot/
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── templates/
│   ├── index.html
│   └── settings.html
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── chat.js
│       └── settings.js

                                   '''

