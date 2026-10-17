#!/usr/bin/env bash
# After a deploy: signed-out requests to the app must go to the Cloudflare Access
# login (or be refused), never get a 200 from the app. It needs no credentials.
#
#   scripts/live-check.sh https://jobquest.paulclarke.au https://paulclarke.cloudflareaccess.com
#
# A new custom domain can take minutes for DNS and its certificate, so it retries
# while the host can't be reached (curl exit 6, 7, 35 or 60), for about 5 minutes.
set -euo pipefail

app_url=${1:?usage: live-check.sh <app url> <access team url>}
access_url=${2:?usage: live-check.sh <app url> <access team url>}
attempts=${LIVE_CHECK_ATTEMPTS:-30}
wait_seconds=${LIVE_CHECK_WAIT:-10}

check() {
  local path=$1 out code status location
  for attempt in $(seq 1 "$attempts"); do
    # No -L: the redirect itself is what's checked
    if out=$(curl -sS -o /dev/null --max-time 15 -w '%{http_code} %{redirect_url}' "$app_url$path"); then
      break
    else
      code=$?
    fi
    case $code in
      6 | 7 | 35 | 60)
        if [ "$attempt" -eq "$attempts" ]; then
          echo "::error::$app_url$path still unreachable (curl exit $code)"
          return 1
        fi
        echo "$app_url$path not reachable yet (curl exit $code), retrying in ${wait_seconds}s"
        sleep "$wait_seconds"
        ;;
      *)
        echo "::error::curl failed for $app_url$path (exit $code)"
        return 1
        ;;
    esac
  done

  status=${out%% *}
  location=${out#* }
  case $status in
    301 | 302 | 303 | 307 | 308)
      if [[ $location != "$access_url"/* ]]; then
        echo "::error::$path redirects to $location, not the Access login"
        return 1
      fi
      echo "ok: $path redirects to the Access login"
      ;;
    401 | 403)
      echo "ok: $path is refused ($status)"
      ;;
    *)
      echo "::error::$path answered $status without signing in"
      return 1
      ;;
  esac
}

check /
check /api/me
