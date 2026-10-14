<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/ac579189-435e-4a99-91e6-d0f5ca879b9d" /># Classroom Quiz Studio

A conversational quiz builder for any school grade or subject. Describe the lesson in ordinary language; Gemini asks for missing details, checks what standards framework the teacher uses, and prepares an editable quiz with an optional answer key.

## Run locally

Requires Node.js 20.12 or newer and a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```sh
node server.mjs
```

Add your key to `.env` as `GEMINI_API_KEY=your_key_here`, then open [http://localhost:3000](http://localhost:3000). The server accepts `PORT` and `GEMINI_MODEL` environment variables for configuration. The local `.env` file is git-ignored, and the API key is only used by the server.

<img width="1920" height="1080" alt="Screenshot (379)" src="https://github.com/user-attachments/assets/2238d0b0-5d51-4cd4-ba52-79f9dfbbc041" />


