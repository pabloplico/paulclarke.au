#!/usr/bin/env bash
# Summarises how a branch changes the test suite, so test edits get reviewed on
# their own: test files added, deleted and changed, assertions removed and
# added, and new skips. It never fails the build; it only reports.
#
#   scripts/test-diff-summary.sh [base] [head]   (defaults: origin/main, HEAD)
#
# In GitHub Actions it also writes the table to the job summary and adds a
# warning annotation for each deleted test file and each file that loses
# assertions.

set -euo pipefail

BASE="${1:-origin/main}"
HEAD="${2:-HEAD}"
RANGE="$BASE...$HEAD"

# Unit tests, Playwright specs and Vitest snapshots
PATHSPEC=(
  ':(glob)**/*.test.ts' ':(glob)**/*.test.tsx'
  ':(glob)**/*.spec.ts' ':(glob)**/*.spec.tsx'
  ':(glob)**/__snapshots__/*.snap'
)

# Assertion lines: expect(...), expect.soft(...), assert(...), assert.x(...)
ASSERT='(^|[^A-Za-z_.])(expect(\.soft)?|assert(\.[A-Za-z]+)?)\('
SKIP='\.(skip|only|todo|fixme)\('

count() { grep -cE "$1" || true; }

rows=()
warnings=()
added=0
deleted=0
changed=0
total_removed=0
total_added=0
total_skips=0

while IFS=$'\t' read -r status file rest; do
  # Renames come through as R<score> old new; report the new path
  if [[ $status == R* ]]; then file="$rest"; fi
  diff=$(git diff -U0 "$RANGE" -- "$file")
  minus=$(grep -E '^-[^-]' <<<"$diff" || true)
  plus=$(grep -E '^\+[^+]' <<<"$diff" || true)
  removed=$(count "$ASSERT" <<<"$minus")
  new=$(count "$ASSERT" <<<"$plus")
  skips=$(count "$SKIP" <<<"$plus")
  total_removed=$((total_removed + removed))
  total_added=$((total_added + new))
  total_skips=$((total_skips + skips))

  case "$status" in
    A) added=$((added + 1)); label='added' ;;
    D)
      deleted=$((deleted + 1)); label='**deleted**'
      warnings+=("$file|Test file deleted ($removed assertions). Check the behaviour it covered is still tested.")
      ;;
    *)
      changed=$((changed + 1)); label='changed'
      if ((removed > new)); then
        warnings+=("$file|Removes more assertion lines than it adds ($removed removed, $new added). Check no expectation was weakened to get the test passing.")
      fi
      ;;
  esac
  rows+=("| \`$file\` | $label | $removed | $new | $skips |")
done < <(git diff --name-status -M "$RANGE" -- "${PATHSPEC[@]}")

{
  echo '## Test changes'
  echo
  if ((${#rows[@]} == 0)); then
    echo 'No test files changed.'
  else
    echo "$added added, $changed changed, $deleted deleted. Assertion lines: $total_removed removed, $total_added added. New skip/only/todo/fixme calls: $total_skips."
    echo
    echo '| File | Status | Assertions removed | Assertions added | New skips |'
    echo '|---|---|---:|---:|---:|'
    printf '%s\n' "${rows[@]}"
    echo
    echo "Review with: \`git diff $RANGE -- '*.test.ts' '*.test.tsx' '*.spec.ts' '*.spec.tsx' '*.snap'\`"
  fi
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

if [[ -n ${GITHUB_ACTIONS:-} ]]; then
  for w in "${warnings[@]}"; do
    echo "::warning file=${w%%|*},title=Test change::${w#*|}"
  done
fi
