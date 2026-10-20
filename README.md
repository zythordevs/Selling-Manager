# Shopsy Manager (Components V2 + MongoDB)

1. `npm install`
2. Copy `.env.example` to `.env` and fill in TOKEN, CLIENT_ID, GUILD_ID, MONGO_URI (and optionally STORE_NAME / STATUS_TEXT)
3. `npm run deploy` (registers slash commands), then `npm start`
4. In Discord (admin): `/setup channels`, `/setup support_role`, `/setup upi`, `/setup qr`, `/setup crypto_add`, `/setup panel`

Status: Do Not Disturb, activity text "Managing MR ASHISH" (change with STATUS_TEXT).

Bot permissions: View Channels, Send Messages, Manage Channels, Manage Roles, Attach Files, Read Message History.
On Linux servers install a font package (e.g. `apt install fonts-dejavu`) so generated images render text.

MongoDB collections: `state` (settings, stock, tickets, counters), `vouches`, `feedbacks`, `files` (QR image).
