/**
 * System Prompt Sections — Module 4
 * @module dsh-plugin-glm-vision/prompt-sections
 */

export function registerPromptSections(ctx) {
  ctx.systemPrompt.section({
    name: 'tool:image_query',
    order: 115,
    text: [
      '## image_query 视觉问答工具',
      '',
      '你有一个名为 `image_query` 的视觉问答工具，可以调用 GLM-4.1V-Thinking-Flash 视觉大模型来分析图片。',
      '',
      '### 功能',
      '- 接收一个或多个图片路径（本地文件路径或网络URL）和一个问题',
      '- 返回视觉模型对这些图片的分析回答',
      '',
      '### 调用方式',
      '```json',
      '{',
      '  "paths": ["/path/to/image.png", "https://example.com/img.jpg"],',
      '  "question": "请描述这张图片中的内容"',
      '}',
      '```',
      '',
      '### 适用场景',
      '- 当你收到用户发送的图片时（消息中包含 `[用户发送了一张图片]` 标记）',
      '- 当你需要对图片进行详细视觉分析时',
      '- 当你需要比较多张图片时',
      '',
      '### 重要',
      '- 当用户发送图片时，你**必须**立即调用 `image_query` 工具来分析图片',
      '- paths 数组支持一个或多个元素',
      '- 图片会被自动缓存，后续引用相同图片不会重复下载'
    ].join('\n')
  });
}
