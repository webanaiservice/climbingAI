#!/usr/bin/env bash

set -euo pipefail

env_file="${1:?Pass the production environment file path}"
allowed_email="${2:?Pass the pilot account email}"

if [[ ! -f "$env_file" ]]; then
  printf 'Missing production environment: %s\n' "$env_file" >&2
  exit 1
fi
if [[ ! "$allowed_email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]]; then
  printf 'Invalid pilot account email\n' >&2
  exit 1
fi

IFS= read -r api_key
if [[ ! "$api_key" =~ ^[^[:space:]]+$ ]]; then
  printf 'Missing or invalid model API key\n' >&2
  exit 1
fi

umask 077
temporary_file="$(mktemp "${env_file}.XXXXXX")"
trap '[[ ! -e "$temporary_file" ]] || rm -f -- "$temporary_file"' EXIT

awk -F= '$1 != "AI_ROUTE_SETTING_ENABLED" && $1 != "AI_ROUTE_SETTING_ALLOWED_EMAILS" && $1 != "DEROUTER_API_KEY" { print }' \
  "$env_file" > "$temporary_file"
printf 'AI_ROUTE_SETTING_ENABLED=true\nAI_ROUTE_SETTING_ALLOWED_EMAILS=%s\nDEROUTER_API_KEY=%s\n' \
  "$allowed_email" "$api_key" >> "$temporary_file"
unset api_key

chmod --reference="$env_file" "$temporary_file"
chown --reference="$env_file" "$temporary_file"
mv -- "$temporary_file" "$env_file"

printf 'Configured AI route setting for one pilot account.\n'
