#!/bin/bash

# Fetch recent n8n executions for debugging
# Usage: ./fetch_n8n_executions.sh

N8N_URL="https://visionairy.app.n8n.cloud/api/v1"
N8N_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxY2YwYmRlNS01MmUzLTRjNGMtOGViOS02MDk5ZjU3ZmZlODgiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYxNzY1NzA5fQ.jOVw0fU-TXTRtBV4XrFXzq_Vu1Oz4mhIKkda3WwjjOg"

echo "Fetching recent executions from n8n..."
echo "======================================"

# Get list of workflows first
echo ""
echo "Available workflows:"
curl -s -X GET "${N8N_URL}/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  | jq '.data[] | {id: .id, name: .name}' 2>/dev/null || echo "Error fetching workflows"

echo ""
echo "======================================"
echo "Fetching recent executions (last 10):"
echo ""

# Get recent executions
curl -s -X GET "${N8N_URL}/executions?limit=10" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  | jq '.' > /tmp/n8n_recent_executions.json

echo "Saved to: /tmp/n8n_recent_executions.json"

# Parse and display summary
echo ""
echo "Execution Summary:"
echo "=================="
cat /tmp/n8n_recent_executions.json | jq -r '.data[] | "\(.id) | \(.workflowData.name) | \(.status) | \(.startedAt)"' 2>/dev/null || echo "Error parsing executions"

echo ""
echo "To get detailed execution data, run:"
echo "  curl -X GET '${N8N_URL}/executions/{execution_id}' -H 'X-N8N-API-KEY: ${N8N_API_KEY}' | jq '.'"
