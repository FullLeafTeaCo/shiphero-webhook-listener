import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN; // e.g., "your-shop.myshopify.com"
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>;
  extensions?: any;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number;
  variants: {
    edges: Array<{
      node: {
        id: string;
        sku: string;
        inventoryQuantity: number;
        inventoryItem: {
          id: string;
          tracked: boolean;
        };
      };
    }>;
  };
}

interface ShopifyProductVariant {
  id: string;
  displayName: string;
  inventoryQuantity: number;
  sku: string;
  title: string;
}

interface ProductSearchResponse {
  products: {
    edges: Array<{
      node: ShopifyProduct;
    }>;
  };
}

interface ProductVariantSearchResponse {
  productVariants: {
    nodes: Array<ShopifyProductVariant>;
  };
}

export async function shopifyGql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error("Missing required Shopify environment variables: SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN");
  }

  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const data: GraphQLResponse<T> = await res.json() as GraphQLResponse<T>;
  
  if (data.errors) {
    const msg = data.errors.map(e => e.message).join("; ");
    throw new Error(`Shopify GraphQL errors: ${msg}`);
  }
  
  return data.data;
}

/**
 * Search for a product variant by SKU in Shopify
 * @param sku - The SKU to search for
 * @returns Product variant data if found, null if not found
 */
export async function findProductBySku(sku: string): Promise<ShopifyProductVariant | null> {
  const query = `
    query ProductVariants($query: String!) { 
      productVariants(first: 1, query: $query) { 
        nodes { 
          displayName 
          id 
          inventoryQuantity 
          sku 
          title 
        } 
      } 
    }
  `;

  const variables = {
    query: `sku:${sku}`
  };

  try {
    const response = await shopifyGql<ProductVariantSearchResponse>(query, variables);
    
    if (response.productVariants.nodes.length === 0) {
      return null;
    }

    return response.productVariants.nodes[0];
  } catch (error) {
    console.error(`Error searching for product with SKU ${sku}:`, error);
    throw error;
  }
}