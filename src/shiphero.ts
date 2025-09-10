import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const API_URL = "https://public-api.shiphero.com/graphql";
const AUTH_URL = "https://public-api.shiphero.com/auth/refresh";
const REFRESH_TOKEN = process.env.SHIPHERO_REFRESH_TOKEN;

// Token management
let accessToken: string | null = null;
let tokenExpiry: number | null = null;

interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{ message: string }>;
}

interface CreateWebhookInput {
  url: string;
  type: string;
}

interface WebhookData {
  id: string;
  name: string;
  url: string;
  shared_signature_secret: string;
}

interface CreateWebhookResponse {
  webhook_create: {
    request_id: string;
    complexity: number;
    webhook: WebhookData;
  };
}

interface DeleteWebhookResponse {
  webhook_delete: {
    request_id: string;
    complexity: number;
  };
}

interface ListWebhooksResponse {
  webhooks: {
    request_id: string;
    complexity: number;
    data: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          url: string;
          account_id: string;
          source: string;
        };
      }>;
    };
  };
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Token refresh function
async function refreshAccessToken(): Promise<string> {
  if (!REFRESH_TOKEN) {
    throw new Error("SHIPHERO_REFRESH_TOKEN not set in environment variables");
  }

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const tokenData: TokenResponse = (await response.json()) as TokenResponse;

  accessToken = tokenData.access_token;
  // Set expiry to 25 days (slightly before the actual 28-30 day expiry)
  tokenExpiry = Date.now() + tokenData.expires_in * 1000;

  return accessToken;
}

// Get valid access token (refresh if needed)
async function getValidAccessToken(): Promise<string> {
  // Check if we have a valid token
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  // Token is expired or doesn't exist, refresh it
  return await refreshAccessToken();
}

export async function gql<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const token = await getValidAccessToken();

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  // If we get a 401, try refreshing the token once
  if (res.status === 401) {
    const newToken = await refreshAccessToken();

    const retryRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const retryData: GraphQLResponse<T> =
      (await retryRes.json()) as GraphQLResponse<T>;
    if (retryData.errors) {
      const msg = retryData.errors.map((e) => e.message).join("; ");
      throw new Error(msg);
    }
    return retryData.data;
  }

  const data: GraphQLResponse<T> = (await res.json()) as GraphQLResponse<T>;
  if (data.errors) {
    const msg = data.errors.map((e) => e.message).join("; ");
    throw new Error(msg);
  }
  return data.data;
}

export async function createWebhook({
  url,
  type,
}: CreateWebhookInput): Promise<CreateWebhookResponse> {
  const query = `
    mutation CreateWebhook($name: String!, $url: String!) {
      webhook_create(data: { name: $name, url: $url }) {
        request_id
        complexity
        webhook {
          id
          name
          url
          shared_signature_secret
        }
      }
    }
  `;
  return gql<CreateWebhookResponse>(query, { name: type, url });
}

export async function deleteWebhook({
  name,
}: {
  name: string;
}): Promise<DeleteWebhookResponse> {
  const query = `
    mutation DeleteWebhook($name: String!) {
      webhook_delete(data: { name: $name }) {
        request_id
        complexity
      }
    }
  `;
  return gql<DeleteWebhookResponse>(query, { name });
}

export async function listWebhooks(): Promise<ListWebhooksResponse> {
  const query = `
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
  return gql<ListWebhooksResponse>(query);
}

export async function getProductLocations(sku: string): Promise<any> {
  const query = `
    query ProductLocations($sku: String!) {
      product(sku: $sku) {
        request_id
        data {
          id
          sku
          name
          warehouse_products {
            locations {
              edges {
                node {
                  location {
                    type { name }
                    name
                  }
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    sku: sku
  };

  try {
    const response = await gql<any>(query, variables);

    console.log(response);

    if (!response) {
      return null;
    }

    return response.product.data;
  } catch (error) {
    console.error(`Error searching for product with SKU ${sku}:`, error);
    throw error;
  }
}

// Export token refresh function for testing
export { refreshAccessToken, getValidAccessToken };
