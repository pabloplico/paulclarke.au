#!/bin/bash
# Blocks file edits on protected branches.
# Exit code 2 = block the tool call and show the message to the agent.

set -e

CURRENT_BRANCH=$(cd "$CLAUDE_PROJECT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

PROTECTED_BRANCHES=("main" "master" "production" "develop")

for branch in "${PROTECTED_BRANCHES[@]}"; do
  if [ "$CURRENT_BRANCH" = "$branch" ]; then
    echo "BLOCKED: Cannot edit files on protected branch '$CURRENT_BRANCH'." >&2
    echo "" >&2
    echo "You must:" >&2
    echo "  1. Create a feature branch: git checkout -b feat/<descriptive-name>" >&2
    echo "  2. Make your changes on that branch" >&2
    echo "  3. Commit, push, and create a PR with: gh pr create" >&2
    exit 2
  fi
done

exit 0
