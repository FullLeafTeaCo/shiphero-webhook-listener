# ShipHero Inventory Listener

A TypeScript-based webhook listener for ShipHero inventory events. This application receives and processes real-time inventory updates, order events, and warehouse operations from ShipHero.

## 🚀 Features

- **Real-time Webhook Processing**: Handles ShipHero webhooks with HMAC signature verification
- **TypeScript**: Full type safety with proper interfaces and error handling
- **Async Work Queue**: Processes webhooks asynchronously to ensure fast acknowledgment
- **Comprehensive Logging**: Structured logging with Pino for debugging and monitoring
- **Multiple Webhook Types**: Supports Inventory Change, Inventory Update, Tote Cleared, and Order Packed Out events

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **ShipHero Account** with API access
- **ngrok** (for local development)

## 🛠 Local Development Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd shiphero-inventory-listener
npm install
```

### 2. Environment Configuration

Create a `.env` file in the project root:

```bash
# ShipHero API Configuration
SHIPHERO_GRAPHQL_TOKEN=your_shiphero_graphql_token_here
SHIPHERO_WEBHOOK_SECRET=your_webhook_secret_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Public URL (will be set after ngrok setup)
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io
```

### 3. Get Your ShipHero Credentials

1. **GraphQL Token**:

   - Log into your ShipHero account
   - Go to Settings → API → GraphQL
   - Generate a new token and copy it to `SHIPHERO_GRAPHQL_TOKEN`

2. **Webhook Secret**:
   - You'll get this when you create your first webhook
   - Or use any secure random string for testing

### 4. Set Up ngrok

#### Install ngrok:

```bash
# macOS with Homebrew
brew install ngrok

# Or download from https://ngrok.com/download
```

#### Configure ngrok (optional but recommended):

```bash
ngrok config add-authtoken <your-ngrok-auth-token>
```

#### Start ngrok tunnel:

```bash
ngrok http 3000
```

You'll see output like:

```
Forwarding    https://abc123def456.ngrok.io -> http://localhost:3000
```

#### Update your .env:

Copy the `https://` URL from ngrok and update your `.env`:

```bash
PUBLIC_BASE_URL=https://abc123def456.ngrok.io
```

### 5. Start the Development Server

```bash
# Start with live reload
npm run dev

# Or run TypeScript directly
npm run start:dev
```

You should see:

```
server - Listening {"PORT":3000}
```

### 6. Test Your Setup

```bash
# Test the health endpoint
curl https://your-ngrok-url.ngrok.io/healthz

# Test webhook endpoint
npm run test:webhook
```

## 🎣 Webhook Management

### Registering Webhooks

#### Register All Webhooks:

```bash
npm run register:webhooks
```

#### Register Individual Webhooks:

```bash
npm run register:tote-cleared
npm run register:order-packed-out
```

### Managing Webhooks

#### List Registered Webhooks:

```bash
npm run list:webhooks
```

#### Delete All Webhooks:

```bash
npm run delete:webhooks
```

### Testing Webhooks

#### Test with Sample Data:

```bash
# Test generic webhook endpoint
npm run test:webhook

# Test inventory update specifically
npm run test:inventory-update

# Send test webhook from localhost
npm run test:send
```

#### Monitor Webhook Activity:

```bash
npm run monitor
```

## 🔧 Adding New Webhook Types

Follow these steps to add support for a new ShipHero webhook type:

### Step 1: Add the Webhook Type to Registration Scripts

**In `scripts/registerWebhooks.ts`**, add your new webhook type to the `types` array:

```typescript
const types: string[] = [
  "Inventory Change",
  "Inventory Update",
  "Tote Cleared",
  "Order Packed Out",
  "Your New Webhook Type", // Add this line
];
```

**In `scripts/deleteWebhooks.ts`**, add it to the deletion list:

```typescript
const types: string[] = [
  "Inventory Change",
  "Inventory Update",
  "Tote Cleared",
  "Order Packed Out",
  "Your New Webhook Type", // Add this line
];
```

### Step 2: Create a Handler

Create a new handler file: `src/handlers/yourNewWebhook.ts`

```typescript
import { createLogger } from "../logger.js";
const log = createLogger("yourNewWebhook");

export async function handleYourNewWebhook(payload: any): Promise<void> {
  log.info({ payload }, "🆕 Processing Your New Webhook");

  // TODO: Add your business logic here
  // Process the webhook payload according to your needs

  // Example:
  const { account_id, some_field } = payload || {};

  log.info(
    {
      account_id,
      some_field,
    },
    `🆕 Your New Webhook processed for account ${account_id}`
  );
}
```

### Step 3: Add Handler to Server

**In `src/server.ts`**:

1. **Import the handler** at the top:

```typescript
import { handleYourNewWebhook } from "./handlers/yourNewWebhook.js";
```

2. **Add case to switch statement**:

```typescript
switch (type) {
  case "Inventory Change":
    await handleInventoryChange(payload);
    break;
  case "Inventory Update":
    await handleInventoryUpdate(payload);
    break;
  case "Tote Cleared":
    await handleToteCleared(payload);
    break;
  case "Order Packed Out":
    await handleOrderPackedOut(payload);
    break;
  case "Your New Webhook Type": // Add this case
    await handleYourNewWebhook(payload);
    break;
  default:
    log.warn({ type, payload }, `⚠️ Unhandled webhook_type: ${type}`);
}
```

### Step 4: Create Registration Script (Optional)

Create `scripts/registerYourNewWebhook.ts`:

```typescript
import "dotenv/config";
import { createWebhook } from "../src/shiphero.js";

const base: string | undefined = process.env.PUBLIC_BASE_URL;
if (!base) {
  throw new Error("PUBLIC_BASE_URL not set");
}

const webhookUrl = `${base}/webhooks/shiphero`;
const type = "Your New Webhook Type";

(async (): Promise<void> => {
  const r = await createWebhook({ url: webhookUrl, type });
  console.log("Created:", r.webhook_create.webhook);
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
```

### Step 5: Add Script to package.json

Add the new script to your `package.json`:

```json
{
  "scripts": {
    "register:your-new-webhook": "tsx scripts/registerYourNewWebhook.ts"
  }
}
```

### Step 6: Test Your New Webhook

1. **Register the webhook**:

```bash
npm run register:your-new-webhook
```

2. **Verify registration**:

```bash
npm run list:webhooks
```

3. **Test with sample data** (create a test script similar to existing ones)

4. **Monitor logs** when ShipHero sends real events

## 📜 Available Scripts

### Development

- `npm run dev` - Start development server with live reload
- `npm run start:dev` - Run TypeScript directly without building
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled JavaScript (production)
- `npm run type-check` - Check TypeScript types without compilation

### Webhook Management

- `npm run register:webhooks` - Register all webhook types
- `npm run register:tote-cleared` - Register Tote Cleared webhook
- `npm run register:order-packed-out` - Register Order Packed Out webhook
- `npm run delete:webhooks` - Delete all registered webhooks
- `npm run list:webhooks` - List all registered webhooks

### Testing & Monitoring

- `npm run test:webhook` - Test webhook endpoint with sample data
- `npm run test:inventory-update` - Test inventory update webhook
- `npm run test:send` - Send test webhook from localhost
- `npm run monitor` - Monitor webhook system status

## 🐛 Troubleshooting

### Common Issues

#### 1. "PUBLIC_BASE_URL not set" Error

- Make sure your `.env` file has the correct ngrok URL
- Restart ngrok if the URL changed
- Update `.env` with the new ngrok URL

#### 2. "Invalid webhook signature" Error

- Check that `SHIPHERO_WEBHOOK_SECRET` matches your ShipHero webhook configuration
- Ensure the secret is the same in both ShipHero dashboard and your `.env`

#### 3. Webhooks Not Firing

- Verify webhooks are registered: `npm run list:webhooks`
- Check that your ngrok tunnel is still active
- Ensure you're making actual changes in ShipHero that would trigger the webhooks
- Check server logs for any errors

#### 4. TypeScript Compilation Errors

- Run `npm run type-check` to see specific type errors
- Make sure all imports use `.js` extensions (TypeScript ES modules requirement)
- Verify all dependencies are installed: `npm install`

### Debugging Tips

1. **Check webhook delivery in ShipHero**:

   - Go to your ShipHero webhook settings
   - Look for delivery logs and response codes

2. **Monitor server logs**:

   - Look for webhook received messages: `🎣 Webhook received`
   - Check for processing messages: `🔄 Processing webhook`
   - Watch for errors: `💥 Webhook handler error`

3. **Test ngrok connectivity**:

   ```bash
   curl https://your-ngrok-url.ngrok.io/healthz
   ```

4. **Verify environment variables**:
   ```bash
   node -e "console.log(process.env.PUBLIC_BASE_URL)"
   ```

## 📝 Project Structure

```
├── src/
│   ├── handlers/           # Webhook event handlers
│   │   ├── inventoryChange.ts
│   │   ├── inventoryUpdate.ts
│   │   ├── toteCleared.ts
│   │   └── orderPackedOut.ts
│   ├── hmac.ts            # HMAC signature verification
│   ├── logger.ts          # Logging configuration
│   ├── queue.ts           # Async work queue
│   ├── server.ts          # Main Express server
│   └── shiphero.ts        # ShipHero GraphQL client
├── scripts/               # Utility scripts
│   ├── registerWebhooks.ts
│   ├── listWebhooks.ts
│   ├── deleteWebhooks.ts
│   └── test*.ts
├── dist/                  # Compiled JavaScript (git-ignored)
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies and scripts
└── .env                   # Environment variables (git-ignored)
```

## 🔐 Security Notes

- Never commit your `.env` file to version control
- Use strong, unique secrets for `SHIPHERO_WEBHOOK_SECRET`
- Regularly rotate your ShipHero API tokens
- Monitor webhook delivery logs for suspicious activity
- Consider implementing rate limiting for production deployments

## 🚀 Production Deployment

For production deployment:

1. **Build the application**:

   ```bash
   npm run build
   ```

2. **Use a process manager** like PM2:

   ```bash
   npm install -g pm2
   pm2 start dist/src/server.js --name "shiphero-listener"
   ```

3. **Set up reverse proxy** (nginx/Apache) instead of ngrok

4. **Configure proper logging** and monitoring

5. **Set up SSL certificates** for your domain

## 📄 License

[Your License Here]
