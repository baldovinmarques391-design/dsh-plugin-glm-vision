/**
 * Old Conversation Context Injection — Module 5
 * @module dsh-plugin-glm-vision/context-inject
 */

const INJECTION_MARKER = '[dsh-plugin-glm-vision:context-inject]';

const CONTEXT_TEXT = [
  INJECTION_MARKER,
  '',
  '## 新增工具: image_query 视觉问答',
  '',
  '你现在已经拥有一个名为 `image_query` 的视觉问答工具。',
  '',
  '**功能**: 向 GLM-4.1V-Thinking-Flash 视觉大模型发送图片并提出问题，获取视觉分析结果。',
  '',
  '**调用方式**:',
  '```json',
  '{',
  '  "paths": ["/path/to/image.png"],',
  '  "question": "请描述这张图片"',
  '}',
  '```',
  '',
  '- `paths`: 图片路径数组（本地路径或网络URL）',
  '- `question`: 针对图片的问题',
  '',
  '当你需要分析图片时，请使用此工具。'
].join('\n');

export function registerContextInjection(ctx, options) {
  let injected = false;

  ctx.systemPrompt.context({
    name: 'glm-vision:compat-inject',
    order: 200,
    get text() {
      return injected ? CONTEXT_TEXT : '';
    }
  });

  return {
    triggerInjection() { injected = true; },
    isInjected() { return injected; },
    reset() { injected = false; },
    INJECTION_MARKER,
    CONTEXT_TEXT
  };
}
