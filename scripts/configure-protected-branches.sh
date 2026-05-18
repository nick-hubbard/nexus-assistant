#!/usr/bin/env bash
set -euo pipefail

repo="$(gh repo view --json owner,name --jq '.owner.login + "/" + .name')"
branches=("main" "develop")

for branch in "${branches[@]}"; do
  echo "Configuring branch protection for ${repo}:${branch}"

  gh api \
    --silent \
    --method PUT \
    "repos/${repo}/branches/${branch}/protection" \
    --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Validate"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON
done

echo "Protected branch policy applied for ${repo}."
