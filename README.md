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

## Slack Bot Integration

Use the built-in Slack bot to capture questions directly from Slack channels and link back to rendered answers.

### Environment variables

Add the following to `.env.local` (or your deployment environment):

- `SLACK_APP_ID`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`

### Required Slack scopes

Grant the bot the following OAuth scopes:

- `app_mentions:read`
- `chat:write`
- `channels:history` (and `groups:history` if you want private channel support)

### Slack App configuration

1. In **Event Subscriptions**, enable events and set the request URL to `https://<your-domain>/api/slack/events`.
2. Subscribe to the **Bot Event** `app_mention`.
3. Install the app into your workspace.

When someone @mentions the bot, it reacts with a 🧠 emoji immediately, generates an answer via the UI agent, saves the result (including plan metadata), and replies in the same thread with a shareable link (`/answer/<id>`). The brain emoji is removed once processing is complete.

### Local testing

1. Start the Next.js dev server (`npm run dev`).
2. Expose it with a tunnel such as `ngrok http 3000`.
3. Update the Slack request URL to the tunneling domain (e.g., `https://example.ngrok.app/api/slack/events`).
4. Mention the bot in Slack and confirm it posts back a link that opens the hosted answer page.

## Troubleshooting

- **Command not found**: Restart terminal after installing cursor-agent
- **Not authenticated**: Run `cursor-agent login`
- **Deployment fails**: Check `CURSOR_API_KEY` is set in Railway environment variables
- **Local dev works but deployment doesn't**: Ensure prebuild script ran successfully in build logs

## License

MIT
