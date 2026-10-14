import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(root, 'public');
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const responseSchema = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: ['ask_follow_up', 'create_quiz'] },
    message: { type: 'STRING' },
    questions: { type: 'ARRAY', items: { type: 'STRING' } },
    title: { type: 'STRING' },
    grade_and_subject: { type: 'STRING' },
    standards: { type: 'ARRAY', items: { type: 'STRING' } },
    directions: { type: 'STRING' },
    quiz_questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['multiple_choice', 'short_answer', 'true_false'] },
          prompt: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['type', 'prompt', 'options', 'answer', 'explanation'],
      },
    },
  },
  required: ['type', 'message', 'questions', 'title', 'grade_and_subject', 'standards', 'directions', 'quiz_questions'],
};

const system = `You are a thoughtful K-12 quiz-writing assistant. The teacher describes a quiz in ordinary language. Have a brief conversation before writing it when key details are missing. Confirm the grade or age range, subject/course, learning target or topic, desired question count, and standards/jurisdiction when relevant. Ask no more than three clear questions at a time, and don't ask again for details already given. The teacher may teach any school subject or grade. Write all quiz content in clear English unless the teacher requests another language. Match vocabulary and reading load to the students' grade.

When standards alignment is requested but the jurisdiction, framework, or standard code is unclear, ask which one they use. Never invent standard codes or claim precise alignment without enough information. If the teacher doesn't need formal alignment, say so in the quiz's standards list. Once there is enough information, create the quiz directly without further confirmation. Use a sensible, varied mix of question types unless specified. Make answer keys accurate; use options for multiple-choice and true/false questions and an empty options list for short-answer questions. Keep questions age-appropriate and unambiguous.

Return only JSON matching the requested response schema. For follow-up questions, set type to ask_follow_up and populate message and questions; set quiz fields to empty strings or arrays. When ready to create the quiz, set type to create_quiz and populate title, grade_and_subject, standards, directions, and quiz_questions; set questions to an empty array and message to an empty string.`;

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function handleChat(request, response) {
  if (!process.env.GEMINI_API_KEY) {
    sendJson(response, 503, { error: 'Add GEMINI_API_KEY to the server environment to connect Gemini.' });
    return;
  }

  let body;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 64_000) {
        sendJson(response, 413, { error: 'This conversation is too long. Start a new quiz request.' });
        return;
      }
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    sendJson(response, 400, { error: 'Send a valid JSON conversation.' });
    return;
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) {
    sendJson(response, 400, { error: 'A conversation must contain between 1 and 20 messages.' });
    return;
  }

  if (body.messages.some((message) => !message || typeof message !== 'object' || Array.isArray(message))) {
    sendJson(response, 400, { error: 'Conversation messages must be objects.' });
    return;
  }

  const messages = body.messages.map(({ role, content }) => ({ role, content }));
  if (messages.some(({ role, content }) => !['user', 'assistant'].includes(role) || typeof content !== 'string')) {
    sendJson(response, 400, { error: 'Conversation messages must have a user or assistant role and text content.' });
    return;
  }

  try {
    const contents = messages.map(({ role, content }) => ({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }],
    }));
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      sendJson(response, upstream.status, { error: result.error?.message || 'Gemini could not process this request.' });
      return;
    }

    const text = result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) {
      sendJson(response, 502, { error: 'Gemini returned an empty response. Please try again.' });
      return;
    }
    const parsed = JSON.parse(text);
    if (!['ask_follow_up', 'create_quiz'].includes(parsed.type)) {
      sendJson(response, 502, { error: 'Gemini returned an unexpected response. Please try again.' });
      return;
    }
    if (parsed.type === 'create_quiz') {
      parsed.questions = parsed.quiz_questions;
      delete parsed.quiz_questions;
    }
    sendJson(response, 200, parsed);
  } catch (error) {
    sendJson(response, 502, { error: error instanceof SyntaxError ? 'Gemini returned invalid quiz data. Please try again.' : 'Could not reach Gemini. Check the server connection and try again.' });
  }
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/chat') {
    await handleChat(request, response);
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405).end('Method not allowed');
    return;
  }

  const pathname = request.url === '/' ? '/index.html' : decodeURIComponent(request.url.split('?')[0]);
  const filePath = normalize(join(publicDirectory, pathname));
  if (!filePath.startsWith(`${publicDirectory}/`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Quiz studio ready at http://localhost:${port}`);
});
