#!/bin/bash
set -e

echo "=== Synatra Stripe Test Mode Setup ==="
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

# Check if logged in
if ! stripe config --list &> /dev/null; then
    echo "Error: Not logged in to Stripe"
    echo "Run: stripe login"
    exit 1
fi

echo "Creating Product..."
PRODUCT_RESPONSE=$(stripe products create \
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
METER_RUN_RESPONSE=$(stripe billing meters create \
  --display-name "Run Executions" \
  --event-name "run.completed" \
  --default-aggregation.formula sum 2>&1)

if ! echo "$METER_RUN_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating run meter:"
    echo "$METER_RUN_RESPONSE"
    exit 1
fi

METER_RUN_ID=$(echo "$METER_RUN_RESPONSE" | jq -r '.id')
echo "✓ Created Meter (Run): $METER_RUN_ID"
echo ""

echo "Creating Meter for Managed LLM Usage..."
METER_LLM_RESPONSE=$(stripe billing meters create \
  --display-name "Managed LLM Usage" \
  --event-name "llm.run" \
  --default-aggregation.formula sum \
  --value-settings.event-payload-key value 2>&1)

if ! echo "$METER_LLM_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating LLM meter:"
    echo "$METER_LLM_RESPONSE"
    exit 1
fi

METER_LLM_ID=$(echo "$METER_LLM_RESPONSE" | jq -r '.id')
echo "✓ Created Meter (LLM): $METER_LLM_ID"
echo ""

echo "Creating Price: Starter (\$49/month, 1,000 runs included)..."
PRICE_STARTER_RESPONSE=$(stripe prices create \
  --product $PRODUCT_ID \
  --currency usd \
  --recurring.interval month \
  --recurring.usage-type metered \
  --billing-scheme tiered \
  --tiers-mode graduated \
  --recurring.meter $METER_RUN_ID \
  -d 'tiers[0][up_to]=1000' \
  -d 'tiers[0][flat_amount]=4900' \
  -d 'tiers[1][up_to]=inf' \
  -d 'tiers[1][unit_amount]=8' 2>&1)

if ! echo "$PRICE_STARTER_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Starter price:"
    echo "$PRICE_STARTER_RESPONSE"
    exit 1
fi

PRICE_STARTER=$(echo "$PRICE_STARTER_RESPONSE" | jq -r '.id')
echo "✓ Created Price (Starter): $PRICE_STARTER"
echo ""

echo "Creating Price: Pro (\$149/month, 2,500 runs included)..."
PRICE_PRO_RESPONSE=$(stripe prices create \
  --product $PRODUCT_ID \
  --currency usd \
  --recurring.interval month \
  --recurring.usage-type metered \
  --billing-scheme tiered \
  --tiers-mode graduated \
  --recurring.meter $METER_RUN_ID \
  -d 'tiers[0][up_to]=2500' \
  -d 'tiers[0][flat_amount]=14900' \
  -d 'tiers[1][up_to]=inf' \
  -d 'tiers[1][unit_amount]=6' 2>&1)

if ! echo "$PRICE_PRO_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Pro price:"
    echo "$PRICE_PRO_RESPONSE"
    exit 1
fi

PRICE_PRO=$(echo "$PRICE_PRO_RESPONSE" | jq -r '.id')
echo "✓ Created Price (Pro): $PRICE_PRO"
echo ""

echo "Creating Price: Business (\$299/month, 6,000 runs included)..."
PRICE_BUSINESS_RESPONSE=$(stripe prices create \
  --product $PRODUCT_ID \
  --currency usd \
  --recurring.interval month \
  --recurring.usage-type metered \
  --billing-scheme tiered \
  --tiers-mode graduated \
  --recurring.meter $METER_RUN_ID \
  -d 'tiers[0][up_to]=6000' \
  -d 'tiers[0][flat_amount]=29900' \
  -d 'tiers[1][up_to]=inf' \
  -d 'tiers[1][unit_amount]=5' 2>&1)

if ! echo "$PRICE_BUSINESS_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "Error creating Business price:"
    echo "$PRICE_BUSINESS_RESPONSE"
    exit 1
fi

PRICE_BUSINESS=$(echo "$PRICE_BUSINESS_RESPONSE" | jq -r '.id')
echo "✓ Created Price (Business): $PRICE_BUSINESS"
echo ""

# Output summary
echo ""
echo "==================================="
echo "   Stripe Setup Complete (Test Mode)"
echo "==================================="
echo ""
echo "Product ID:          $PRODUCT_ID"
echo "Run Meter ID:        $METER_RUN_ID"
echo "LLM Meter ID:        $METER_LLM_ID"
echo "Starter Price ID:    $PRICE_STARTER"
echo "Pro Price ID:        $PRICE_PRO"
echo "Business Price ID:   $PRICE_BUSINESS"
echo ""
echo "Add these to your .env file:"
echo ""
echo "STRIPE_RUN_METER_ID=$METER_RUN_ID"
echo "STRIPE_LLM_METER_ID=$METER_LLM_ID"
echo "STRIPE_PRICE_STARTER=$PRICE_STARTER"
echo "STRIPE_PRICE_PRO=$PRICE_PRO"
echo "STRIPE_PRICE_BUSINESS=$PRICE_BUSINESS"
echo ""
echo "Dashboard: https://dashboard.stripe.com/test/products/$PRODUCT_ID"
echo ""
