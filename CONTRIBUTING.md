# Contributing to homectl

Thanks for your interest! Here's how to get started.

## Development

```bash
# Clone and install
git clone https://github.com/casper-justus/homectl.git
cd homectl
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Project structure

```
src/
  cli.ts              # CLI entry point
  commands/           # Command definitions (Commander)
  core/               # Business logic
  config/             # Config types and loader
  adapters/           # SSH, Docker, Compose, shell adapters
  renderers/          # Output formatters (table, JSON, plain)
  utils/              # Cross-platform utilities, TUI prompts
```

## Guidelines

- **TypeScript** — strict mode, no `any` where avoidable
- **No external TUI libs** — use the custom readline-based prompts in `src/utils/prompts.ts`
- **Cross-platform** — use `src/utils/platform.ts` for OS-specific operations
- **SSH-first** — remote execution always goes through SSH, never plain TCP Docker
- **Safety** — all destructive actions should support `--dry-run` and confirmation
- **Output** — every list/detail command should support `--json` and `--plain`

## Testing

```bash
# Build check
npm run build

# Manual testing
node dist/index.js host ls
node dist/index.js config validate
```

## Pull requests

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to verify
5. Submit a PR
