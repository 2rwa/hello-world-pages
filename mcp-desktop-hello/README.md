# ChatGPT Desktop MCP Extensions — Hello World

Minimal **local** MCP server using Node.js 20+ only (no npm dependencies).
Demonstrates sidebar/global and thread entrypoints.

## Install on Mac

1. Check `node --version` (v20 or newer).
2. In a terminal with Codex CLI, run:
   ```sh
   codex plugin marketplace add 2rwa/hello-world-pages
   ```
3. Restart **ChatGPT Desktop**, open **Plugins**, choose the **Hello World Pages Experiments** marketplace, and install **Desktop Hello World**.
4. Open the app from the sidebar or as a **Hello panel** tab in a conversation. Click the button.
5. Optionally ask ChatGPT to call `hello.open` and check that it returns Hello World.

## Tests

```sh
cd mcp-desktop-hello
node --test test/smoke.test.mjs
```

## HTML-only preview

https://2rwa.github.io/hello-world-pages/mcp-desktop-hello/

**This static GitHub Pages preview is not an MCP server.** The plugin launches a local stdio process.
The Node smoke test checks MCP initialize, tools/list, tools/call, resources/list, resources/read, and entrypoint metadata.
ChatGPT Desktop UI rendering still requires verification on a Mac. This demo deliberately omits the MCP Apps iframe-to-host JavaScript bridge, which is needed for richer two-way UI integration.

References: [OpenAI MCP Extensions](https://github.com/openai/mcp-extensions), [Plugin packaging](https://developers.openai.com/plugins/build/plugins).
