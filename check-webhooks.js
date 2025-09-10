import 'dotenv/config';
import fetch from 'node-fetch';

const API_URL = "https://public-api.shiphero.com/graphql";
const TOKEN = process.env.SHIPHERO_GRAPHQL_TOKEN;

async function gql(query, variables = {}) {

  
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });

  
  const rawData = await res.text();

  
  const data = JSON.parse(rawData);

  
  if (data.errors) {
    const msg = data.errors.map(e => e.message).join("; ");
    throw new Error(msg);
  }
  return data.data;
}


// First, let's try a simple query to test authentication
const simpleQuery = `
  query {
    account {
      id
      name
    }
  }
`;

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
            created_at
            updated_at
          }
        }
      }
    }
  }
`;

try {

  const accountResponse = await gql(simpleQuery);

  
 
  const webhookResponse = await gql(webhookQuery);


  

  if (webhookResponse?.webhooks?.data?.edges) {
    webhookResponse.webhooks.data.edges.forEach((w, i) => {
      const webhook = w.node;
      // Webhook details available but not logged
    });
  } else {
    // No webhooks found or API response structure different
  }
} catch (e) {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
}
