import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const API_URL = "https://public-api.shiphero.com/graphql";
const TOKEN = process.env.SHIPHERO_GRAPHQL_TOKEN;

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

export async function gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });
  const data: GraphQLResponse<T> = await res.json() as GraphQLResponse<T>;
  if (data.errors) {
    const msg = data.errors.map(e => e.message).join("; ");
    throw new Error(msg);
  }
  return data.data;
}

export async function createWebhook({ url, type }: CreateWebhookInput): Promise<CreateWebhookResponse> {
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

export async function deleteWebhook({ name }: { name: string }): Promise<DeleteWebhookResponse> {
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