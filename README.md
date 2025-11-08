# Cursor Gen UI

Generate UI components tailored to your questions. Built with Cursor Agent CLI.

## Local Development

```bash
# Install Cursor CLI
curl https://cursor.com/install -fsS | bash
cursor-agent login

# Clone and run
git clone git@github.com:eriknson/cursor-gen-ui.git
cd cursor-gen-ui
npm install
npm run dev
```

Open http://localhost:3000

## Model Selection

Switch models by adding `?model=MODEL_NAME` to the URL:
- `?model=composer-1` - Fast, default
- `?model=auto` - Intelligent routing
- `?model=gpt-5` - GPT-5
- `?model=sonnet-4.5` - Claude Sonnet 4.5

Other available: `sonnet-4`, `opus-4.1`, `grok`

This sets `NEXT_PUBLIC_ALLOWED_MODELS` to include all models. The file is gitignored.

## Troubleshooting

- **Command not found**: Restart terminal after installing cursor-agent
- **Not authenticated**: Run `cursor-agent login`
- **Deployment fails**: Check `CURSOR_API_KEY` is set in Railway environment variables
- **Local dev works but deployment doesn't**: Ensure prebuild script ran successfully in build logs

## License

MIT
