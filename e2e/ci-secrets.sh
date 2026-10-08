#!/bin/sh
# Fresh identity secrets for one CI job, never stored anywhere (CLAUDE.md §1). Appended to $GITHUB_ENV and masked.
# Each is base64 of 32 random bytes: a valid PHONE_ENCRYPTION_KEY, long enough for the others, and the two JWT
# secrets differ.
set -eu
for name in JWT_ACCESS_SECRET JWT_REFRESH_SECRET PHONE_ENCRYPTION_KEY PHONE_HASH_KEY; do
  value=$(openssl rand -base64 32)
  echo "::add-mask::$value"
  echo "$name=$value" >>"$GITHUB_ENV"
done
