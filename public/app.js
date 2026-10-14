const composer = document.querySelector('#composer');
const promptInput = document.querySelector('#prompt');
const sendButton = document.querySelector('#send-button');
const conversation = document.querySelector('#conversation');
const quizElement = document.querySelector('#quiz');
const emptyPreview = document.querySelector('#empty-preview');
const previewActions = document.querySelector('#preview-actions');
const previewFooter = document.querySelector('#preview-footer');
const answerToggle = document.querySelector('#show-answers');
const toast = document.querySelector('#toast');

let messages = [];
let currentQuiz = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function addUserMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = 'user-message';
  bubble.textContent = text;
  conversation.append(bubble);
  conversation.scrollTop = conversation.scrollHeight;
}

function addAssistantMessage(message, questions = []) {
  const row = document.createElement('div');
  row.className = 'assistant-message';
  const mark = document.createElement('span');
  mark.className = 'gemini-mark';
  mark.textContent = 'G';
  mark.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'message-copy';
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  copy.append(paragraph);
  if (questions.length) {
    const list = document.createElement('ul');
    questions.forEach((question) => {
      const item = document.createElement('li');
      item.textContent = question;
      list.append(item);
    });
    copy.append(list);
  }
  row.append(mark, copy);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
}

function renderQuiz(quiz) {
  currentQuiz = quiz;
  quizElement.replaceChildren();

  const title = document.createElement('h3');
  title.className = 'quiz-title';
  title.textContent = quiz.title;
  quizElement.append(title);

  const meta = document.createElement('p');
  meta.className = 'quiz-meta';
  meta.textContent = `${quiz.grade_and_subject} · ${quiz.questions.length} questions`;
  quizElement.append(meta);

  if (quiz.standards.length) {
    const tags = document.createElement('div');
    tags.className = 'quiz-standards';
    quiz.standards.forEach((standard) => {
      const tag = document.createElement('span');
      tag.className = 'standard-tag';
      tag.textContent = standard;
      tags.append(tag);
    });
    quizElement.append(tags);
  }

  const directions = document.createElement('p');
  directions.className = 'quiz-directions';
  directions.textContent = quiz.directions;
  quizElement.append(directions);

  quiz.questions.forEach((question, index) => {
    const block = document.createElement('section');
    block.className = 'question';
    const heading = document.createElement('div');
    heading.className = 'question-heading';
    const number = document.createElement('span');
    number.className = 'question-number';
    number.textContent = String(index + 1);
    const prompt = document.createElement('p');
    prompt.className = 'question-prompt';
    prompt.textContent = question.prompt;
    heading.append(number, prompt);
    block.append(heading);

    const type = document.createElement('p');
    type.className = 'question-type';
    type.textContent = question.type.replaceAll('_', ' ');
    block.append(type);

    if (question.options.length) {
      const options = document.createElement('div');
      options.className = 'options';
      question.options.forEach((option, optionIndex) => {
        const row = document.createElement('div');
        row.className = 'option';
        const marker = document.createElement('span');
        marker.className = 'option-marker';
        marker.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = `${String.fromCharCode(65 + optionIndex)}. ${option}`;
        row.append(marker, label);
        options.append(row);
      });
      block.append(options);
    }

    const answer = document.createElement('div');
    answer.className = 'answer-block';
    const answerLabel = document.createElement('strong');
    answerLabel.textContent = 'Answer';
    const answerText = document.createElement('span');
    answerText.textContent = question.explanation ? `${question.answer} · ${question.explanation}` : question.answer;
    answer.append(answerLabel, answerText);
    answer.hidden = !answerToggle.checked;
    block.append(answer);
    quizElement.append(block);
  });

  emptyPreview.hidden = true;
  quizElement.hidden = false;
  previewActions.hidden = false;
  previewFooter.hidden = false;
  document.querySelector('#preview-count').textContent = `${quiz.questions.length} items`;
  document.querySelector('#preview-title').textContent = 'Quiz preview';
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text || sendButton.disabled) return;

  messages.push({ role: 'user', content: text });
  addUserMessage(text);
  promptInput.value = '';
  sendButton.disabled = true;
  sendButton.querySelector('span:first-child').textContent = 'Thinking';
  const loading = document.createElement('div');
  loading.className = 'loading-message';
  loading.textContent = 'Gemini is thinking...';
  conversation.append(loading);
  conversation.scrollTop = conversation.scrollHeight;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');

    if (result.type === 'ask_follow_up') {
      const reply = `${result.message}\n${result.questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}`;
      messages.push({ role: 'assistant', content: reply });
      addAssistantMessage(result.message, result.questions);
    } else if (result.type === 'create_quiz') {
      const summary = `Quiz created: ${result.title} (${result.questions.length} questions).`;
      messages.push({ role: 'assistant', content: summary });
      addAssistantMessage('Your quiz is ready. You can review the questions and reveal the answer key on the right.');
      renderQuiz(result);
    } else {
      throw new Error('Gemini returned an unexpected response. Please try again.');
    }
  } catch (error) {
    messages.pop();
    promptInput.value = text;
    showToast(error.message);
  } finally {
    loading.remove();
    sendButton.disabled = false;
    sendButton.querySelector('span:first-child').textContent = currentQuiz ? 'Refine quiz' : 'Build quiz';
    promptInput.focus();
  }
});

answerToggle.addEventListener('change', () => {
  quizElement.querySelectorAll('.answer-block').forEach((answer) => {
    answer.hidden = !answerToggle.checked;
  });
});

document.querySelector('#copy-button').addEventListener('click', async () => {
  if (!currentQuiz) return;
  const lines = [currentQuiz.title, currentQuiz.grade_and_subject, '', currentQuiz.directions, ''];
  currentQuiz.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    question.options.forEach((option, optionIndex) => lines.push(`   ${String.fromCharCode(65 + optionIndex)}. ${option}`));
    if (answerToggle.checked) lines.push(`   Answer: ${question.answer}${question.explanation ? ` (${question.explanation})` : ''}`);
    lines.push('');
  });
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showToast('Quiz copied to clipboard.');
  } catch {
    showToast('Clipboard access is unavailable in this browser.');
  }
});

document.querySelector('#print-button').addEventListener('click', () => window.print());
