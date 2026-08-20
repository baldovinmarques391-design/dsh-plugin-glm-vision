# DeepSeek Harness (DSH) Plugin Development Guide

> Comprehensive technical reference compiled from the [main DSH repository](https://github.com/deepseek-ai/deepseek-harness), the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) ecosystem, official [skill documentation](https://github.com/NanmiCoder/dsh-agent-teams/blob/main/skills/dsh-plugin-development/SKILL.md), and the local `@deepseek-ai/dsh` checkout at `D:\Program Files (x86)\node-v26.4.0-win-x64\node_modules\@deepseek-ai\dsh`.

---

## Table of Contents

1. [Plugin Structure](#1-plugin-structure)
2. [package.json Format](#2-packagejson-format)
3. [cordis.patch.yml Format](#3-cordispatchyml-format)
4. [Plugin Entry Point](#4-plugin-entry-point)
5. [Config Schema](#5-config-schema)
6. [Tool Registration](#6-tool-registration)
7. [System Prompt Injection](#7-system-prompt-injection)
8. [Context Injection](#8-context-injection)
9. [Image/Attachment Handling](#9-imageattachment-handling)
10. [Error Handling](#10-error-handling)
11. [Best Practices](#11-best-practices)

---

## 1. Plugin Structure

### Recommended File Structure

```
my-dsh-plugin/
├── package.json              # Plugin manifest + npm metadata
├── cordis.patch.yml          # Entry point declaration for Cordis loader
├── lib/
│   ├── index.js              # Main plugin entry (the Cordis plugin object)
│   └── types/
│       └── index.d.ts        # TypeScript declarations (optional)
├── src/
│   └── index.ts              # TypeScript source (compiled to lib/)
├── README.md
└── LICENSE
```

### Required Files

| File | Required | Purpose |
|------|----------|---------|
| `package.json` | **Yes** | NPM manifest with `dsh` metadata fields |
| `cordis.patch.yml` | **Yes** | Declares the plugin row(s) for the Cordis loader |
| `lib/index.js` | **Yes** | The actual plugin code (Cordis plugin object) |
| `README.md` | Recommended | Documentation |
| `LICENSE` | Recommended | License file |

> **Key insight**: DSH uses the [Cordis](https://github.com/cordiverse/cordis) plugin framework. Every capability in DSH is a plugin row in a `cordis.yml`/`cordis.patch.yml`. There is no separate configuration language — changing what an agent can do means changing which rows are composed for it. ([Source: editing-cordis-compositions SKILL.md](https://github.com/deepseek-ai/deepseek-harness))

---

## 2. package.json Format

### Standard Fields

Based on official DSH packages (e.g., `@deepseek-ai/dsh-tool-web`, `@deepseek-ai/dsh-tool-todo`):

```json
{
  "name": "@scope/dsh-plugin-my-feature",
  "description": "Brief description of what the plugin does",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./invariant": {
      "types": "./lib/types/invariant.d.ts",
      "default": "./lib/invariant.js"
    },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "lib/invariant.js",
    "lib/types/**/*.d.ts"
  ],
  "license": "MIT",
  "peerDependencies": {
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-system-prompt": "^0.1.0-rc.7",
    "@deepseek-ai/cordis": "^4.0.1"
  },
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.1"
  }
}
```

### Key `package.json` Rules

| Field | Rule |
|-------|------|
| `"type": "module"` | **Required** — DSH uses ESM exclusively |
| `"main"` | Points to the compiled JS entry |
| `"exports"` | Must include the `"."` entry with both `types` and `default` |
| `peerDependencies` | Use for DSH core services (`@deepseek-ai/dsh-tools`, `@deepseek-ai/cordis`, etc.) |
| `dependencies` | Use for your own code; `@deepseek-ai/schemastery` for config schemas |

> **Note**: The `dsh` and `dsh.bundle` fields seen in some community plugins are **not** part of the official Cordis-based plugin contract. The official DSH plugin system uses `cordis.patch.yml` for entry point declaration, not `package.json` fields. Some community tools may use a `dsh.client` convention for browser-side plugin bundles, but the official architecture separates host-side (Node.js) and client-side (browser) code through the `code.host` / `code.client` pattern in Cordis dynamic plugins, or through the `dsh.client` row convention in composition files. ([Source: dsh-web-app cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness))

---

## 3. cordis.patch.yml Format

The `cordis.patch.yml` file declares how your plugin integrates into the DSH composition tree. It uses YAML with a specific structure.

### Basic Plugin Row

```yaml
# cordis.patch.yml — declare the plugin row(s)
- id: my-plugin                    # Unique row identifier
  name: '@scope/dsh-plugin-my-feature'  # NPM package name (resolved from node_modules)
  config:                          # Optional: default configuration
    enabled: true
    someValue: 42
```

### With Dependencies (inject)

```yaml
- id: my-plugin
  name: '@scope/dsh-plugin-my-feature'
  inject: [webStartup]             # Service dependencies to inject
  config:
    value: !!js ctx.webStartup.someValue  # Dynamic config from injected service
```

### Adding New Rows (insert)

```yaml
- insert:
    - id: my-first-plugin
      name: '@scope/dsh-plugin-feature-a'
    - id: my-second-plugin
      name: '@scope/dsh-plugin-feature-b'
      config:
        option: value
```

### Disabling a Plugin

```yaml
- id: some-existing-plugin
  disabled: true
```

### Groups with Isolated Realms

When a plugin publishes a service, it must be wrapped in an `isolate` realm to prevent collisions across sessions:

```yaml
- id: my-plugin-group
  name: cordis:group
  group: true
  isolate:
    myService: true                # true = private to each mounting session
  config:
    - id: my-provider
      name: '@scope/dsh-plugin-provider'
    - id: my-consumer
      name: '@scope/dsh-plugin-consumer'
```

### Platform-specific Conditional

```yaml
- id: bash-sandbox
  name: '@deepseek-ai/dsh-bash-sandbox'
  disabled: !!js process.platform === 'win32'
  config:
    timeoutMs: 60000

- id: pwsh-sandbox
  name: '@deepseek-ai/dsh-pwsh-sandbox'
  disabled: !!js process.platform !== 'win32'
```

> **Source**: Extracted from [dsh-base/cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness) and [dsh-web-app/cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness).

### Patch Layer Precedence

The composition tree layers in this order (last write wins per row id):
1. Each bundle's patch in `dsh.profile.bundles` order
2. The profile's `cordis.patch.yml`
3. The home-level `$DSH_HOME/cordis.patch.yml`
4. `--patch` overlays

([Source: DSH README](https://github.com/deepseek-ai/deepseek-harness))

---

## 4. Plugin Entry Point

### The Cordis Plugin Object

Every DSH plugin exports a Cordis plugin object. The standard pattern used by all official plugins:

```js
// lib/index.js
import z from "@deepseek-ai/schemastery";

/** Cordis plugin name used by loader diagnostics. */
const name = "my-plugin";

/** Services required by this plugin. */
const inject = ["tools", "systemPrompt"];

/** Config schema using schemastery. */
const Config = z.object({
  enabled: z.boolean().default(true),
  maxValue: z.number().default(100),
});

/**
 * Apply function — called when the plugin is activated.
 * @param {import("@deepseek-ai/cordis").Context} ctx - Cordis context
 * @param {object} config - Resolved configuration
 */
function apply(ctx, config) {
  // Register tools, prompt sections, event listeners, etc.
  // All side effects are automatically cleaned up when the plugin is disposed.
}

export { Config, apply, inject, name };
```

### Required Exports

| Export | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | `string` | **Yes** | Cordis plugin name for loader diagnostics |
| `inject` | `string[]` | **Yes** | Hard service dependencies (plugin waits until they're available) |
| `apply` | `function` | **Yes** | `(ctx, config) => void` — the plugin's activation function |
| `Config` | `Schema` | Recommended | Schemastery schema for configuration validation |

### The `apply(ctx, config)` Pattern

From the official [`cordis-plugin-development` SKILL.md](https://github.com/deepseek-ai/deepseek-harness):

```js
function apply(ctx, config) {
  // 1. Access optional services with ctx.get() and handle absence
  const service = ctx.get('someService');
  if (service === undefined) return;

  // 2. Access required services directly (they're guaranteed by inject)
  ctx.tools.register(/* ... */);

  // 3. Register event listeners (auto-disposed on plugin stop)
  ctx.on('some/event', (payload) => {
    console.log(payload);
  });

  // 4. Use ctx.effect() for external subscriptions
  ctx.effect(() => service.subscribe((value) => {
    console.log(value);
  }));
}
```

### Hard vs. Optional Dependencies

```js
// HARD dependency — plugin waits until 'timer' is available
const inject = ['timer'];
function apply(ctx) {
  ctx.timeout(() => console.log('done'), 300);  // Safe: inject guarantees availability
}

// OPTIONAL dependency — check with ctx.get()
function apply(ctx) {
  const timer = ctx.get('timer');
  if (timer === undefined) return;  // Graceful degradation
}
```

> **Rule**: Do not overuse `inject` merely to avoid an `undefined` check. Do not access `ctx.requiredService` without declaring the injection; the Guard rejects undeclared dependencies. ([Source: cordis-plugin-development SKILL.md](https://github.com/deepseek-ai/deepseek-harness))

---

## 5. Config Schema

### Using Schemastery

DSH uses [`@deepseek-ai/schemastery`](https://github.com/cordiverse/schemastery) for configuration schemas. This is the same schema library used by Koishi and Cordis.

```js
import z from "@deepseek-ai/schemastery";

const Config = z.object({
  // Boolean with default
  enabled: z.boolean().default(true),

  // Required number
  maxValue: z.number().required(),

  // String with default
  mode: z.string().default("auto"),

  // Enum (string union)
  level: z.enum(["low", "medium", "high"]).default("medium"),

  // Optional number (undefined when not provided)
  timeoutMs: z.number(),

  // Array
  allowedOrigins: z.array(z.string()).default([]),

  // Nested object
  advanced: z.object({
    retries: z.number().default(3),
    backoff: z.boolean().default(false),
  }).default({}),
});
```

### Real-world Example (from `@deepseek-ai/dsh-tool-web`)

```js
const Config = z.object({
  search: z.boolean().default(true),
  fetch: z.boolean().default(true),
  searchMaxResults: z.number().default(8),
  fetchTimeoutMs: z.number().default(30000),
  searchTimeoutMs: z.number().default(30000),
  fetchMaxOutputChars: z.number().default(200000),
});
```

### Real-world Example (from `@deepseek-ai/dsh-tool-todo`)

```js
const Config = z.object({
  allowParallelInProgress: z.boolean().required(),
});
```

### Config in cordis.patch.yml

```yaml
- id: my-plugin
  name: '@scope/dsh-plugin-my-feature'
  config:
    enabled: true
    maxValue: 50
    mode: fast
```

> **Note**: Some community plugins also use `zod` alongside schemastery (as seen in `dsh-tool-todo` which imports both), but schemastery is the canonical choice for Cordis/DSH plugin configuration.

---

## 6. Tool Registration

### The `defineTool` API

Import `defineTool` from `@deepseek-ai/dsh-tools`:

```js
import { defineTool } from "@deepseek-ai/dsh-tools";
```

### `defineTool` Signature

Based on the actual source code in `@deepseek-ai/dsh-tools`:

```js
defineTool(options) → ToolDefinition
```

#### Options Object

```typescript
interface DefineToolOptions {
  /** Tool name (becomes the model-facing function name) */
  name: string;

  /** Model-facing description */
  description: string;

  /** Parameter schema (author-facing DSL → compiled to JSON Schema) */
  parameters: ParameterSchemaSpec;

  /** Output schema + render function */
  output: {
    schema: ValueSchemaSpec;
    render: (args: any, value: any) => ContentBlock[];
    presentationMeta?: (args: any, value: any) => any;
  };

  /** Optional: cooperative timeout budget in ms */
  timeoutMs?: number;

  /** Optional: whether the tool is safe to run concurrently */
  isConcurrencySafe?: (args: any) => boolean;

  /** The execution function */
  execute: (args: any, exec: ExecutionContext) => Promise<any>;

  /** Optional: pending-call presentation */
  presentCall?: (args: any) => PresentationView;

  /** Optional: completed-call presentation */
  presentResult?: (args: any, result: any) => PresentationView | undefined;

  /** Optional: finalize content before logging */
  finalizeContent?: (exec: ExecutionContext, result: any) => any;
}
```

### Parameter Schema DSL

The parameter schema uses a simplified author-facing DSL that compiles to JSON Schema:

```js
parameters: {
  query: {
    type: "string",
    required: true,
    description: "The search query."
  },
  maxResults: {
    type: "number",
    description: "Maximum number of results to return."
  },
  tags: {
    type: "array",
    required: true,
    description: "List of tags.",
    items: {
      type: "string"
    }
  },
  options: {
    type: "object",
    additionalProperties: false,
    properties: {
      verbose: {
        type: "boolean",
        required: true
      }
    }
  }
}
```

#### Supported Parameter Types

| Type | Supports |
|------|----------|
| `"string"` | `enum`, `const` |
| `"number"` | `enum`, `const` |
| `"integer"` | `enum`, `const` |
| `"boolean"` | `const` |
| `"null"` | `const` |
| `"array"` | `items` |
| `"object"` | `properties`, `additionalProperties` |
| `"json"` | (unconstrained JSON value) |
| `oneOf` | Union of multiple schemas |

### Output Schema DSL

The output schema supports the same types but adds `oneOf`:

```js
output: {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      content: { type: "string" },
      sources: {
        type: "array",
        required: true,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: { type: "string", required: true },
            title: { type: "string" },
          }
        }
      },
      truncated: { type: "boolean", required: true }
    }
  },
  render: (_args, value) => [{
    type: "text",
    text: formatOutput(value)
  }]
}
```

### Registering a Tool

```js
function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: "my_tool",
    description: "Does something useful for the model.",
    parameters: {
      input: {
        type: "string",
        required: true,
        description: "The input value."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          result: { type: "string", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.result
      }]
    },
    async execute(args, exec) {
      // exec.signal — AbortSignal for cancellation
      // exec.agent — the owning agent session (if any)
      // exec.callId — unique call identifier
      // exec.deferContext(context) — inject additional context
      // exec.concludeTurn() — end the current turn
      return { result: `Processed: ${args.input}` };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `Processing: ${args.input}`,
      kind: "other",
      rawInput: args.input
    })
  }));
}
```

### Complete Real-world Example (`web_search`)

From `@deepseek-ai/dsh-tool-web`:

```js
import { defineTool } from "@deepseek-ai/dsh-tools";

function applyWebSearchTool(ctx, maxResults, timeoutMs, fetchEnabled) {
  // Register system prompt guidance
  ctx.systemPrompt.section({
    name: "tool:web_search",
    order: 110,
    text: "Use the web_search tool to discover current information..."
  });

  // Register the tool
  ctx.tools.register(defineTool({
    name: "web_search",
    description: "Search the web for current information.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "The search query."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: { type: "string" },
          sources: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: "string", required: true },
                title: { type: "string" },
                snippet: { type: "string" },
              }
            }
          },
          truncated: { type: "boolean", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: formatSearchOutput(value)
      }],
      presentationMeta: (_args, value) => searchMetaFromValue(value)
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = await ctx.web.search({
        query: args.query,
        maxResults
      }, exec.signal);
      return {
        sources: result.sources.map(s => ({ url: s.url, ...s })),
        truncated: result.truncated
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: args.query,
      kind: "search",
      rawInput: args.query
    }),
    presentResult: (args, result) => presentSearchResult(args, result)
  }));
}
```

### ExecutionContext API

The `exec` object passed to `execute()`:

| Property/Method | Description |
|----------------|-------------|
| `exec.signal` | `AbortSignal` — fires when the tool call is cancelled |
| `exec.agent` | The owning agent session (undefined for non-agent callers) |
| `exec.callId` | Unique identifier for this tool call |
| `exec.rootCallId` | Root call identifier |
| `exec.token` | Execution token |
| `exec.parent` | Parent token |
| `exec.deferContext(context)` | Inject additional context into the conversation |
| `exec.concludeTurn()` | End the current agent turn |

---

## 7. System Prompt Injection

### Registering Prompt Sections

The `systemPrompt` service provides methods to inject content into the model's system prompt:

```js
function apply(ctx, config) {
  // Register an ordered prompt section
  ctx.systemPrompt.section({
    name: "my-plugin:instructions",
    order: 100,                    // Lower = earlier in prompt
    text: "You have access to a custom tool that..."
  });

  // Section with dynamic text (function)
  ctx.systemPrompt.section({
    name: "my-plugin:dynamic",
    order: 200,
    text: (context) => `Current time: ${new Date().toISOString()}`
  });
}
```

### Section API

```typescript
interface SectionInput {
  /** Unique section name (scoped sections shadow globals with same name) */
  name: string;
  /** Numeric order (lower = earlier; must be finite) */
  order: number;
  /** Static text or function returning text */
  text: string | ((context: AssemblyContext) => string);
  /** If true, this section REPLACES all other sections */
  complete?: boolean;
}
```

### Built-in Section Names and Orders

From the local DSH checkout:

| Section | Order | Content |
|---------|-------|---------|
| `harness:identity` | -100 | `"You are an AI agent powered by DeepSeek Harness."` |
| `deployment:persona` | 0 | The configured persona text |
| `tool:web_search` | 110 | Web search guidance |
| `tool:web_fetch` | 111 | Web fetch guidance |

### Real-world Example

```js
function apply(ctx, config) {
  ctx.systemPrompt.section({
    name: "my-plugin:context",
    order: 50,
    text: `You have access to a database plugin. When the user asks about data, use the query_database tool.`
  });
}
```

### Suppressing Runtime Context

```js
function apply(ctx) {
  // Suppress all dynamic runtime-context contributions in this scope
  ctx.systemPrompt.suppressRuntimeContext();
}
```

### Prompt Variables

```js
function apply(ctx) {
  // Register a template variable usable in section text as {{my_var}}
  ctx.systemPrompt.variable("my_var", (context) => "some value");

  // Use it in a section
  ctx.systemPrompt.section({
    name: "my-section",
    order: 10,
    text: "The value is {{my_var}}."
  });
}
```

Variable names must match `/^[a-z][a-z0-9_]*$/`.

> **Source**: [`@deepseek-ai/dsh-system-prompt` source code](https://github.com/deepseek-ai/deepseek-harness)

---

## 8. Context Injection

### Dynamic Runtime Context

Context differs from static prompt sections — it's designed for runtime-varying information that changes between model calls:

```js
function apply(ctx, config) {
  ctx.systemPrompt.context({
    name: "my-plugin:runtime-info",
    order: 50,
    text: (context) => {
      // Return dynamic context based on current state
      return `Current workspace files: ${getWorkspaceSummary()}`;
    }
  });
}
```

### Context vs. Section

| Feature | `section()` | `context()` |
|---------|-------------|-------------|
| Purpose | Static instructions | Dynamic runtime data |
| Header | None | `"Current runtime context. This snapshot supersedes earlier runtime-context snapshots."` |
| Ordering | Same numeric ordering | Same numeric ordering |
| Suppression | Not suppressible | Can be suppressed via `suppressRuntimeContext()` |

### Defer Context from Tool Execution

Tools can inject additional context during execution:

```js
async execute(args, exec) {
  const result = await doSomething();

  // Inject additional context that appears after the tool result
  exec.deferContext({
    type: "text",
    text: `Additional info: ${result.metadata}`,
    source: { kind: "plugin", plugin: "my-plugin" }
  });

  return result;
}
```

### Variable Providers

Register dynamic variables that can be referenced in any section or context text:

```js
function apply(ctx) {
  ctx.systemPrompt.variable("cwd", () => process.cwd());
  ctx.systemPrompt.variable("timestamp", () => new Date().toISOString());
  ctx.systemPrompt.variable("model", (context) => context.model ?? "unknown");
}
```

---

## 9. Image/Attachment Handling

### Attachment Service

DSH provides a content-addressed attachment system through `ctx.attachment` (when the `@deepseek-ai/dsh-attachment` service is mounted):

```js
function apply(ctx) {
  const attachment = ctx.get('attachment');
  if (attachment === undefined) return;

  // Attachments are referenced by content hash in messages
  // The attachment-local backend stores bytes outside the session log
}
```

### Image Content Blocks

Tool results can include images as content blocks:

```js
output: {
  schema: { /* ... */ },
  render: (_args, value) => [
    { type: "text", text: "Here is the analysis:" },
    { type: "image", data: imageBase64, mimeType: "image/png" }
  ]
}
```

### Reading Images

The `read_image` tool (built into DSH) reads PNG/JPEG/WebP/GIF files:

```js
// In a tool that processes images
async execute(args, exec) {
  // The read_image tool is available as a built-in
  // Images returned from tools are attached to the conversation
  return { result: "Analysis complete" };
}
```

### Image Flow in Code Mode

From the `dsh-tools` source code, when a Code Mode sub-tool returns an image:

```js
// Images from sub-tools are automatically attached after the run
if (!result.isError && result.content.some(block => block.type === 'image')) {
  exec.deferContext(createUserMessage({
    content: result.content,
    source: { kind: "plugin", plugin: "tools-code-mode" }
  }));
}
```

### Community Plugin Pattern

Community plugins like `dsh-attach-upload` and `dsh-vision` handle images through:
1. Client-side upload via Slot UI registration
2. Host-side storage via the attachment service
3. Reference passing through message content blocks

---

## 10. Error Handling

### Tool Error Pattern

From the official source code:

```js
async execute(args, exec) {
  try {
    // Validate inputs beyond schema
    if (args.query.trim().length === 0) {
      throw new Error("query must be a non-empty string");
    }

    // Do work
    const result = await ctx.web.search(args.query, exec.signal);
    return formatResult(result);

  } catch (error) {
    // Errors thrown from execute() become structured tool errors
    // The registry converts them to isError results
    throw new Error(`Search failed: ${error.message}`);
  }
}
```

### Error Types

```js
// From @deepseek-ai/dsh-tools
import { HarnessError } from "@deepseek-ai/dsh-llm";

// Custom error with error code
class MyPluginError extends HarnessError {
  constructor(message) {
    super(message, "MY_PLUGIN_ERROR");
    this.name = "MyPluginError";
  }
}
```

### Common Failure Patterns

From the [cordis-plugin-development SKILL.md](https://github.com/deepseek-ai/deepseek-harness):

| Failure | Check First |
|---------|-------------|
| `service "x" is not declared` | Whether code uses `ctx.x` without declaring `inject: ['x']` |
| `cannot get property "timer" without inject` | Query the timer Service and declare `inject: ['timer']` |
| Client parse failure | Whether the code uses JSX, TypeScript, import, or an unavailable global |
| Slot registration failure | Whether the live subtree was queried and options satisfy the protocol |
| `host.call` failure | The Host handler name, pluginRunId, JSON arguments, and dependencies |

### Validation Pattern

```js
function parseArgs(args) {
  // Schema validation is automatic via defineTool
  // Additional semantic validation:
  if (args.url.trim().length === 0) {
    throw new Error("url must be a non-empty string");
  }
  return { url: args.url };
}
```

### Timeout Handling

```js
const tool = defineTool({
  name: "my_tool",
  timeoutMs: 30000,  // Cooperative timeout
  async execute(args, exec) {
    // exec.signal fires on timeout or cancellation
    const result = await fetchData(args.url, exec.signal);
    return result;
  }
});
```

---

## 11. Best Practices

### Lifecycle Management

From the [cordis-plugin-development SKILL.md](https://github.com/deepseek-ai/deepseek-harness):

```js
// ✅ CORRECT — all side effects are fiber-scoped
function apply(ctx, config) {
  ctx.on('some/event', handler);           // Auto-disposed
  ctx.effect(() => subscribe(handler));     // Returns disposer, auto-disposed
  ctx.tools.register(defineTool({...}));    // Auto-disposed
  ctx.systemPrompt.section({...});          // Auto-disposed
}

// ❌ WRONG — global side effects leak
function apply(ctx, config) {
  setInterval(() => doWork(), 1000);        // Global timer, never cleaned
  process.on('SIGTERM', handler);           // Global listener
}
```

### Service Access Pattern

```js
// ✅ CORRECT — optional access with absence check
function apply(ctx) {
  const service = ctx.get('serviceName');
  if (service === undefined) return;
  service.someMethod();
}

// ✅ CORRECT — hard dependency via inject
const inject = ['requiredService'];
function apply(ctx) {
  ctx.requiredService.someMethod();
}

// ❌ WRONG — accessing without inject or get
function apply(ctx) {
  ctx.serviceName.someMethod();  // Throws: undeclared dependency
}
```

### Side Effect Cleanup

```js
// ✅ CORRECT — use ctx.effect() for external subscriptions
function apply(ctx) {
  ctx.effect(() => {
    const unsubscribe = externalService.subscribe(handler);
    return unsubscribe;  // Return disposer
  });
}

// ✅ CORRECT — retain disposer from Cordis APIs
function apply(ctx) {
  const disposer = ctx.systemPrompt.section({...});
  // disposer is automatically managed by Cordis
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Plugin row `id` | kebab-case, descriptive | `tool-web-search`, `my-custom-tool` |
| Plugin `name` | Matches package name | `"tool-web"`, `"my-plugin"` |
| Tool name | snake_case | `web_search`, `todo_write`, `ask_user_question` |
| Prompt section name | colon-separated namespace | `"tool:web_search"`, `"my-plugin:instructions"` |
| Config keys | camelCase | `searchMaxResults`, `timeoutMs` |
| NPM package | `dsh-*` or `@scope/dsh-*` | `dsh-my-plugin`, `@scope/dsh-custom` |

### Internal Live Data Handling

From the [cordis-plugin-development SKILL.md](https://github.com/deepseek-ai/deepseek-harness):

```js
// ❌ WRONG — do not stringify or clone live objects
JSON.stringify(sessionSnapshot);
structuredClone(serviceInstance);

// ✅ CORRECT — extract only needed leaf values
const title = sessionSnapshot.title;
const count = sessionSnapshot.messages.length;
```

### Client-side Code (Browser)

For plugins with browser UI (from the [cordis-plugin-development SKILL.md](https://github.com/deepseek-ai/deepseek-harness)):

```js
// ✅ CORRECT — plain JavaScript, React.createElement
return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      () => React.createElement('div', null, 'Hello'),
    ));
  },
}

// ❌ WRONG — JSX is not supported in dynamic plugins
return {
  apply(ctx) {
    return <div>Hello</div>  // Parse error
  }
}
```

### Agent Preset vs. Host Composition

From the [editing-cordis-compositions SKILL.md](https://github.com/deepseek-ai/deepseek-harness):

| Requirement | Location |
|-------------|----------|
| Files, commands, processes, networking | Host composition |
| Agents, durable session data, lifecycle | Host composition |
| Dynamic model Tools | Host composition (via `harness`) |
| Page theme, layout, state | Agent preset (Client) |
| Conversation Snapshot, session lists | Agent preset (Client) |
| Settings pages, sidebars, overlays | Agent preset (Client) |

### Testing Your Plugin

```sh
# Install in a profile
dsh plugin --profile web add @scope/dsh-plugin-my-feature

# Inspect the composed config without booting
dsh --profile web --dump-config

# Run and test
dsh --profile web
```

### Publishing to NPM

```sh
# Build
npm run build

# Publish
npm publish --access public
```

---

## Quick Reference: Complete Minimal Plugin

```js
// === lib/index.js ===
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

const name = "my-hello-plugin";
const inject = ["tools", "systemPrompt"];

const Config = z.object({
  greeting: z.string().default("Hello"),
});

function apply(ctx, config) {
  // System prompt section
  ctx.systemPrompt.section({
    name: "my-hello:greeting",
    order: 50,
    text: `When greeting the user, say "${config.greeting}".`
  });

  // Register a tool
  ctx.tools.register(defineTool({
    name: "say_hello",
    description: "Say hello to the user with a custom message.",
    parameters: {
      message: {
        type: "string",
        required: true,
        description: "The greeting message."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          greeting: { type: "string", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: value.greeting
      }]
    },
    async execute(args) {
      return { greeting: `${config.greeting}! ${args.message}` };
    }
  }));
}

export { Config, apply, inject, name };
```

```yaml
# === cordis.patch.yml ===
- id: my-hello-plugin
  name: '@scope/dsh-hello-plugin'
  config:
    greeting: "Hey there"
```

```json
// === package.json ===
{
  "name": "@scope/dsh-hello-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "lib/index.js",
  "peerDependencies": {
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-system-prompt": "^0.1.0-rc.7",
    "@deepseek-ai/cordis": "^4.0.1"
  },
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.1"
  }
}
```

---

## Sources

- [DeepSeek Harness Main Repository](https://github.com/deepseek-ai/deepseek-harness) — Architecture docs, core source, cookbook
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — Curated plugin ecosystem
- [DSH Plugin Development SKILL.md](https://github.com/NanmiCoder/dsh-agent-teams/blob/main/skills/dsh-plugin-development/SKILL.md) — Community skill guide
- [dsh-base cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness) — Official base composition (451 lines)
- [dsh-web-app cordis.patch.yml](https://github.com/deepseek-ai/deepseek-harness) — Web surface composition (424 lines)
- [DSH Developer Preview](https://deepseek.com/harness/en/) — Official "Everything is a plugin" page
- [DSH Official Docs Site](https://deepseek-harness.github.io/deepseek-harness/) — Tool authoring reference, cookbook
- Local checkout: `D:\Program Files (x86)\node-v26.4.0-win-x64\node_modules\@deepseek-ai\dsh\` — Source code inspection
