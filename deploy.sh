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

# Build & push the new image
echo "🔨 Building and pushing image..."
gcloud builds submit --tag "$IMAGE" .

echo ""
echo "🚀 Deploying to Cloud Run..."
# Point the existing service at the new image (secrets/SA stay attached)
gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION"

echo ""
echo "✅ Deployment complete!"
echo "🔗 Service URL: https://$SERVICE-$PROJECT.a.run.app"
echo "📊 View in console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE/metrics?project=$PROJECT"
