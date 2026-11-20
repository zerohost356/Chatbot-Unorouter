---
name: web-fetch
description: Fetch and read live web pages from the server. Use when the user asks to check, read, summarize, or extract information from a real URL.
---

# Web Fetch Skill

This environment can fetch real websites server-side.

## When to use
- User provides a URL to read or analyze
- Need current/live page content, documentation, or article text
- Verify information from a specific web page

## How to use
Emit a tool call and stop:

```text
<tool_call>
{"name":"web_fetch","arguments":{"url":"https://example.com"}}
</tool_call>
```

Optional arguments: `{"url":"...","maxChars":12000}`

## Behavior
- Performs a real HTTP(S) request and returns extracted readable text (title, status, content).
- Redirects are followed; binary/unsupported content may be summarized.
- Content is truncated to fit context limits.

## Best practices
- Fetch the exact URL the user asked about.
- Cite what was actually read; note if content is partial/truncated.
- If a page is inaccessible, explain the error and suggest alternatives.
