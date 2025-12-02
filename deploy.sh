#!/bin/bash

# Fast path deployment script for shiphero-inventory-listener
# Usage: ./deploy.sh [tag]
# If no tag is provided, uses timestamp

set -e  # Exit on any error

# Configuration
PROJECT=$(gcloud config get-value project)
REGION=us-central1
REPO=containers
SERVICE=shiphero-inventory-listener

# Generate tag (timestamp or provided argument)
if [ -n "$1" ]; then
    TAG="$1"
else
    TAG=$(date +%Y%m%d-%H%M)
fi

IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/$SERVICE:$TAG"

echo "🚀 Deploying $SERVICE to Cloud Run"
echo "📦 Project: $PROJECT"
echo "🌍 Region: $REGION"
echo "🏷️  Tag: $TAG"
echo "🖼️  Image: $IMAGE"
echo ""

# Load environment variables from .env file
if [ -f .env ]; then
    echo "📝 Loading environment variables from .env file..."
    # Export variables from .env (handles comments and empty lines)
    set -a
    source .env
    set +a
    
    # Build env vars string for gcloud (only include non-empty vars)
    ENV_VARS=""
    # List of environment variables to include in deployment
    ENV_VAR_NAMES=(
        "SHIPHERO_REFRESH_TOKEN"
        "SHIPHERO_WEBHOOK_SECRET"
        "SHOPIFY_SHOP_DOMAIN"
        "SHOPIFY_ACCESS_TOKEN"
        "FIREBASE_SERVICE_ACCOUNT"
        "FIREBASE_SERVICE_ACCOUNT_PATH"
        "FIREBASE_PROJECT_ID"
        "PUBLIC_BASE_URL"
    )
    
    for VAR_NAME in "${ENV_VAR_NAMES[@]}"; do
        VAR_VALUE="${!VAR_NAME}"
        if [ -n "$VAR_VALUE" ]; then
            if [ -n "$ENV_VARS" ]; then
                ENV_VARS="$ENV_VARS,"
            fi
            # Escape commas and equals signs in the value
            ESCAPED_VALUE=$(echo "$VAR_VALUE" | sed 's/,/\\,/g' | sed 's/=/\\=/g')
            ENV_VARS="$ENV_VARS$VAR_NAME=$ESCAPED_VALUE"
        fi
    done
    
    if [ -n "$ENV_VARS" ]; then
        echo "✅ Found environment variables to deploy"
    else
        echo "⚠️  No environment variables found in .env"
    fi
else
    echo "⚠️  No .env file found - skipping environment variable setup"
    ENV_VARS=""
fi

# Build & push the new image
echo ""
echo "🔨 Building and pushing image..."
gcloud builds submit --tag "$IMAGE" .

echo ""
echo "🚀 Deploying to Cloud Run..."
# Deploy with environment variables if they exist
if [ -n "$ENV_VARS" ]; then
    gcloud run deploy "$SERVICE" \
        --image "$IMAGE" \
        --region "$REGION" \
        --set-env-vars "$ENV_VARS"
else
    gcloud run deploy "$SERVICE" \
        --image "$IMAGE" \
        --region "$REGION"
fi

echo ""
echo "✅ Deployment complete!"
echo "🔗 Service URL: https://$SERVICE-$PROJECT.a.run.app"
echo "📊 View in console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE/metrics?project=$PROJECT"
