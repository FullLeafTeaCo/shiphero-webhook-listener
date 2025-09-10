import 'dotenv/config';
import { refreshAccessToken, gql } from './src/shiphero.js';

try {
  // Test token refresh
  const token = await refreshAccessToken();
  
  // Test webhook listing
  const webhookQuery = `
    query ListWebhooks {
      webhooks {
        request_id
        complexity
        data {
          edges {
            node {
              id
              name
              url
              account_id
              source
            }
          }
        }
      }
    }
  `;
  
  const webhookResponse = await gql(webhookQuery);
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
