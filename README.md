# Classroom Quiz Studio

A conversational quiz builder for any school grade or subject. Describe the lesson in ordinary language; Gemini asks for missing details, checks what standards framework the teacher uses, and prepares an editable quiz with an optional answer key.

## Run locally

Requires Node.js 20.12 or newer and a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```sh
node server.mjs
```

Add your key to `.env` as `GEMINI_API_KEY=your_key_here`, then open [http://localhost:3000](http://localhost:3000). The server accepts `PORT` and `GEMINI_MODEL` environment variables for configuration. The local `.env` file is git-ignored, and the API key is only used by the server.