#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    echo "Usage: $0 <environment> [options]"
    echo ""
    echo "Arguments:"
    echo "  environment    Environment name (development, staging, production)"
    echo ""
    echo "Options:"
    echo "  --login        Login to Stripe before setup (sandbox only)"
    echo "  --api-key KEY  Use specific API key (required for production)"
    echo "  --cleanup      Deactivate all resources for the environment"
    echo ""
    echo "Examples:"
    echo "  $0 development --login              # Login and setup development sandbox"
    echo "  $0 staging                          # Setup staging sandbox (already logged in)"
    echo "  $0 production --api-key sk_live_xxx # Setup production with live API key"
    echo "  $0 development --cleanup            # Cleanup development resources"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

ENV_NAME="$1"
shift

if [[ ! "$ENV_NAME" =~ ^(development|staging|production)$ ]]; then
    echo "Error: Environment must be 'development', 'staging', or 'production'"
    exit 1
fi

DO_LOGIN=false
DO_CLEANUP=false
API_KEY=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --login)
            DO_LOGIN=true
            shift
            ;;
        --cleanup)
            DO_CLEANUP=true
            shift
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --api-key=*)
            API_KEY="${1#*=}"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

PROJECT_NAME="synatra-$ENV_NAME"

if [ "$ENV_NAME" = "production" ]; then
    echo "=== Synatra Stripe PRODUCTION Setup ==="
    echo "WARNING: This will create resources in LIVE MODE"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
else
    echo "=== Synatra Stripe Sandbox Setup ==="
fi
echo "Environment: $ENV_NAME"
echo "Project: $PROJECT_NAME"
echo ""

# Check if stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "Error: Stripe CLI is not installed"
    echo "Install with: brew install stripe/stripe-cli/stripe"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed"
    echo "Install with: brew install jq"
    exit 1
fi

# Login if requested
if [ "$DO_LOGIN" = true ]; then
    if [ "$ENV_NAME" = "production" ]; then
        echo "Logging in to Stripe (LIVE MODE)..."
        echo "Please select your main account (not a sandbox) in the browser."
    else
        echo "Logging in to Stripe sandbox..."
        echo "Please select the '$ENV_NAME' sandbox in the browser."
    fi
    stripe login --project-name "$PROJECT_NAME"
    echo ""
fi

# Set up STRIPE_CMD based on authentication method
if [ -n "$API_KEY" ]; then
    STRIPE_CMD="stripe --api-key $API_KEY"
    echo "Using provided API key"
else
    # Check if logged in for this project
    if ! stripe config --list --project-name "$PROJECT_NAME" 2>/dev/null | grep -q "account_id"; then
        if [ "$ENV_NAME" = "production" ]; then
            echo "Error: Production requires --api-key flag"
            echo "Run: $0 production --api-key sk_live_xxx"
            exit 1
        fi
        echo "Error: Not logged in to Stripe for project '$PROJECT_NAME'"
        echo "Run: $0 $ENV_NAME --login"
        exit 1
    fi
    STRIPE_CMD="stripe --project-name $PROJECT_NAME"
fi

# Cleanup mode
if [ "$DO_CLEANUP" = true ]; then
    echo "Cleaning up resources for $ENV_NAME..."

    echo "Deactivating prices..."
    $STRIPE_CMD prices list --limit 100 2>/dev/null | jq -r '.data[] | select(.active == true) | .id' | while read -r price_id; do
        if [ -n "$price_id" ]; then
            $STRIPE_CMD prices update "$price_id" --active=false 2>/dev/null && echo "  Deactivated: $price_id"
        fi
    done

    echo "Archiving products..."
    $STRIPE_CMD products list --limit 100 2>/dev/null | jq -r '.data[] | select(.active == true) | .id' | while read -r product_id; do
        if [ -n "$product_id" ]; then
            $STRIPE_CMD products update "$product_id" --active=false 2>/dev/null && echo "  Archived: $product_id"
        fi
    done

    echo "Deactivating meters..."
    $STRIPE_CMD billing meters list --limit 100 2>/dev/null | jq -r '.data[] | select(.status == "active") | .id' | while read -r meter_id; do
        if [ -n "$meter_id" ]; then
            $STRIPE_CMD billing meters deactivate "$meter_id" 2>/dev/null && echo "  Deactivated: $meter_id"
        fi
    done

    echo ""
    echo "Cleanup complete for $ENV_NAME"
    exit 0
fi

echo "Creating Product..."
PRODUCT_RESPONSE=$($STRIPE_CMD products create \
  --name "Synatra" \
  --description "AI Agent workflow automation platform" 2>&1)

if ! echo "$PRODUCT_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating product:"
    echo "$PRODUCT_RESPONSE"
    exit 1
fi

PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.id')
echo "✓ Created Product: $PRODUCT_ID"
echo ""

echo "Creating Meter for Run Usage..."
METER_RUN_RESPONSE=$($STRIPE_CMD billing meters create \
  --display-name "Run Executions" \
  --event-name "run.completed" \
  -d "default_aggregation[formula]"=sum 2>&1)

if ! echo "$METER_RUN_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating run meter:"
    echo "$METER_RUN_RESPONSE"
    exit 1
fi

METER_RUN_ID=$(echo "$METER_RUN_RESPONSE" | jq -r '.id')
if [ "$METER_RUN_ID" = "null" ] || [ -z "$METER_RUN_ID" ]; then
    echo "Error: Failed to get run meter ID from response:"
    echo "$METER_RUN_RESPONSE" | jq .
    exit 1
fi
echo "✓ Created Meter (Run): $METER_RUN_ID"
echo ""

echo "Creating Meter for Managed LLM Usage..."
METER_LLM_RESPONSE=$($STRIPE_CMD billing meters create \
  --display-name "Managed LLM Usage" \
  --event-name "llm.run" \
  -d "default_aggregation[formula]"=sum \
  -d "value_settings[event_payload_key]"=value 2>&1)

if ! echo "$METER_LLM_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating LLM meter:"
    echo "$METER_LLM_RESPONSE"
    exit 1
fi

METER_LLM_ID=$(echo "$METER_LLM_RESPONSE" | jq -r '.id')
if [ "$METER_LLM_ID" = "null" ] || [ -z "$METER_LLM_ID" ]; then
    echo "Error: Failed to get LLM meter ID from response:"
    echo "$METER_LLM_RESPONSE" | jq .
    exit 1
fi
echo "✓ Created Meter (LLM): $METER_LLM_ID"
echo ""

echo "Creating Starter Plan Prices..."
echo "  Creating Starter License Fee (\$49/month)..."
PRICE_STARTER_LICENSE_RESPONSE=$($STRIPE_CMD prices create \
  --product "$PRODUCT_ID" \
  --currency usd \
  --unit-amount 4900 \
  --recurring.interval month \
  --recurring.usage-type licensed 2>&1)

if ! echo "$PRICE_STARTER_LICENSE_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Starter license price:"
    echo "$PRICE_STARTER_LICENSE_RESPONSE"
    exit 1
fi

PRICE_STARTER_LICENSE=$(echo "$PRICE_STARTER_LICENSE_RESPONSE" | jq -r '.id')
echo "  ✓ Created Starter License: $PRICE_STARTER_LICENSE"

echo "  Creating Starter Overage (1,000 included, \$0.08/run after)..."
PRICE_STARTER_OVERAGE_RESPONSE=$($STRIPE_CMD prices create \
  --product "$PRODUCT_ID" \
  --currency usd \
  --recurring.interval month \
  --recurring.usage-type metered \
  --billing-scheme tiered \
  --tiers-mode graduated \
  --recurring.meter "$METER_RUN_ID" \
  -d 'tiers[0][up_to]=1000' \
  -d 'tiers[0][unit_amount]=0' \
  -d 'tiers[1][up_to]=inf' \
  -d 'tiers[1][unit_amount]=8' 2>&1)

if ! echo "$PRICE_STARTER_OVERAGE_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Starter overage price:"
    echo "$PRICE_STARTER_OVERAGE_RESPONSE"
    exit 1
fi

PRICE_STARTER_OVERAGE=$(echo "$PRICE_STARTER_OVERAGE_RESPONSE" | jq -r '.id')
echo "  ✓ Created Starter Overage: $PRICE_STARTER_OVERAGE"
echo ""

echo "Creating Pro Plan Prices..."
echo "  Creating Pro License Fee (\$149/month)..."
PRICE_PRO_LICENSE_RESPONSE=$($STRIPE_CMD prices create \
  --product "$PRODUCT_ID" \
  --currency usd \
  --unit-amount 14900 \
  --recurring.interval month \
  --recurring.usage-type licensed 2>&1)

if ! echo "$PRICE_PRO_LICENSE_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Pro license price:"
    echo "$PRICE_PRO_LICENSE_RESPONSE"
    exit 1
fi

PRICE_PRO_LICENSE=$(echo "$PRICE_PRO_LICENSE_RESPONSE" | jq -r '.id')
echo "  ✓ Created Pro License: $PRICE_PRO_LICENSE"

echo "  Creating Pro Overage (2,500 included, \$0.06/run after)..."
PRICE_PRO_OVERAGE_RESPONSE=$($STRIPE_CMD prices create \
  --product "$PRODUCT_ID" \
  --currency usd \
  --recurring.interval month \
  --recurring.usage-type metered \
  --billing-scheme tiered \
  --tiers-mode graduated \
  --recurring.meter "$METER_RUN_ID" \
  -d 'tiers[0][up_to]=2500' \
  -d 'tiers[0][unit_amount]=0' \
  -d 'tiers[1][up_to]=inf' \
  -d 'tiers[1][unit_amount]=6' 2>&1)

if ! echo "$PRICE_PRO_OVERAGE_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Pro overage price:"
    echo "$PRICE_PRO_OVERAGE_RESPONSE"
    exit 1
fi

PRICE_PRO_OVERAGE=$(echo "$PRICE_PRO_OVERAGE_RESPONSE" | jq -r '.id')
echo "  ✓ Created Pro Overage: $PRICE_PRO_OVERAGE"
echo ""

echo "Creating Business Plan Prices..."
echo "  Creating Business License Fee (\$299/month)..."
PRICE_BUSINESS_LICENSE_RESPONSE=$($STRIPE_CMD prices create \
  --product "$PRODUCT_ID" \
  --currency usd \
  --unit-amount 29900 \
  --recurring.interval month \
  --recurring.usage-type licensed 2>&1)

if ! echo "$PRICE_BUSINESS_LICENSE_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Business license price:"
    echo "$PRICE_BUSINESS_LICENSE_RESPONSE"
    exit 1
fi

PRICE_BUSINESS_LICENSE=$(echo "$PRICE_BUSINESS_LICENSE_RESPONSE" | jq -r '.id')
echo "  ✓ Created Business License: $PRICE_BUSINESS_LICENSE"

echo "  Creating Business Overage (6,000 included, \$0.05/run after)..."
PRICE_BUSINESS_OVERAGE_RESPONSE=$($STRIPE_CMD prices create \
  --product "$PRODUCT_ID" \
  --currency usd \
  --recurring.interval month \
  --recurring.usage-type metered \
  --billing-scheme tiered \
  --tiers-mode graduated \
  --recurring.meter "$METER_RUN_ID" \
  -d 'tiers[0][up_to]=6000' \
  -d 'tiers[0][unit_amount]=0' \
  -d 'tiers[1][up_to]=inf' \
  -d 'tiers[1][unit_amount]=5' 2>&1)

if ! echo "$PRICE_BUSINESS_OVERAGE_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Business overage price:"
    echo "$PRICE_BUSINESS_OVERAGE_RESPONSE"
    exit 1
fi

PRICE_BUSINESS_OVERAGE=$(echo "$PRICE_BUSINESS_OVERAGE_RESPONSE" | jq -r '.id')
echo "  ✓ Created Business Overage: $PRICE_BUSINESS_OVERAGE"
echo ""

# Output summary
echo ""
echo "==================================="
echo "   Stripe Sandbox Setup Complete"
echo "   Environment: $ENV_NAME"
echo "==================================="
echo ""
echo "Product ID:                  $PRODUCT_ID"
echo "Run Meter ID:                $METER_RUN_ID"
echo "LLM Meter ID:                $METER_LLM_ID"
echo ""
echo "Starter Plan:"
echo "  License Price ID:          $PRICE_STARTER_LICENSE"
echo "  Overage Price ID:          $PRICE_STARTER_OVERAGE"
echo ""
echo "Pro Plan:"
echo "  License Price ID:          $PRICE_PRO_LICENSE"
echo "  Overage Price ID:          $PRICE_PRO_OVERAGE"
echo ""
echo "Business Plan:"
echo "  License Price ID:          $PRICE_BUSINESS_LICENSE"
echo "  Overage Price ID:          $PRICE_BUSINESS_OVERAGE"
echo ""
echo "Add these to your .env (or .env.$ENV_NAME) file:"
echo ""
echo "STRIPE_RUN_METER_ID=$METER_RUN_ID"
echo "STRIPE_LLM_METER_ID=$METER_LLM_ID"
echo "STRIPE_PRICE_STARTER_LICENSE=$PRICE_STARTER_LICENSE"
echo "STRIPE_PRICE_STARTER_OVERAGE=$PRICE_STARTER_OVERAGE"
echo "STRIPE_PRICE_PRO_LICENSE=$PRICE_PRO_LICENSE"
echo "STRIPE_PRICE_PRO_OVERAGE=$PRICE_PRO_OVERAGE"
echo "STRIPE_PRICE_BUSINESS_LICENSE=$PRICE_BUSINESS_LICENSE"
echo "STRIPE_PRICE_BUSINESS_OVERAGE=$PRICE_BUSINESS_OVERAGE"
echo ""
echo "To listen for webhooks locally:"
echo "  stripe listen --project-name $PROJECT_NAME --forward-to localhost:8787/stripe/webhook"
echo ""
