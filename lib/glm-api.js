/**
 * GLM Vision API Client
 * @module dsh-plugin-glm-vision/glm-api
 */

import { readFileSync } from 'node:fs';

const GLM_API_BASE = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_MODEL = 'GLM-4V-Flash';
const GLM_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000];

const IMAGE_DESCRIPTION_PROMPT = `你是一名客观的图片描述员。请对这张图片进行详尽的视觉描述。

要求:
1. 确保内容绝对客观——完全基于画面中可视的实体元素，避免任何主观判断、情感色彩、文化引申或氛围渲染，仅陈述直接可见的内容。
2. 满足字数要求——描述文本总长度需严格达到指定字数或以上，通过多层次、细颗粒度的视觉信息分解来实现充分展开。
3. 限定描述范围——所有描述应紧扣画面本身，包括但不限于物体形态、空间关系、色彩构成、材质表现、光影状态等直接视觉信息，不进行解释或推论。
4. 维持文本结构清晰——尽管内容需极度详尽，但仍需合理组织段落，保持描述的逻辑顺序与层次分明，确保文本整体具备可读性与专业性。

请以画面本身为唯一依据，通过系统且细致的观察，完成符合上述所有条件的描述文本。

本次指定的字数: 4950`;

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
};

export function fileToDataUrl(filePath) {
  const buffer = readFileSync(filePath);
  const ext = filePath.split('.').pop().toLowerCase();
  const mime = EXT_TO_MIME['.' + ext] || 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function resolveImageSource(source) {
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('data:')) {
    return source;
  }
  return fileToDataUrl(source);
}

export async function callGlmVision(apiKey, imageUrl, question, signal) {
  const body = {
    model: GLM_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: question }
      ]
    }],
    max_tokens: 1024,
    temperature: 0.7
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GLM_TIMEOUT_MS);
    const onExternalAbort = signal ? () => controller.abort(signal.reason) : null;
    if (signal) {
      if (signal.aborted) { clearTimeout(timeout); throw new Error('Request aborted'); }
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await fetch(GLM_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`GLM API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('GLM API returned empty response');
      }
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      return content;

    } catch (err) {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      if (err.name === 'AbortError' && !signal?.aborted) {
        if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt])); continue; }
        throw new Error('GLM request timeout');
      }
      if (signal?.aborted) throw new Error('Request aborted');
      if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt])); continue; }
      throw err;
    }
  }
  throw new Error('GLM API failed after all retries');
}

export async function describeImage(apiKey, imageUrl, signal) {
  return callGlmVision(apiKey, imageUrl, IMAGE_DESCRIPTION_PROMPT, signal);
}
