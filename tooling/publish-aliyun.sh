#!/usr/bin/env bash
set -euo pipefail
: "${BLOG_DEPLOY_KEY:?Missing deployment key}"
: "${BLOG_KNOWN_HOSTS:?Missing pinned server host key}"
sha="$(git rev-parse HEAD)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
umask 077
printf '%s\n' "$BLOG_DEPLOY_KEY" > "$work/key"
printf '%s\n' "$BLOG_KNOWN_HOSTS" > "$work/known_hosts"
BLOG_SOURCE_SHA="$sha" node --input-type=module -e '
  import {writeFileSync} from "node:fs";
  writeFileSync("public/deployment.json", JSON.stringify({sourceCommit:process.env.BLOG_SOURCE_SHA,builtAt:new Date().toISOString(),url:"https://blog.kfad127.xyz"})+"\n");
'
tar -czf "$work/site.tar.gz" -C public .
ssh -T -i "$work/key" -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 \
  blog-deploy@47.93.233.128 "publish $sha" < "$work/site.tar.gz"
curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
  https://blog.kfad127.xyz/deployment.json |
  BLOG_SOURCE_SHA="$sha" node --input-type=module -e '
    let s=""; for await (const c of process.stdin) s+=c;
    if(JSON.parse(s).sourceCommit!==process.env.BLOG_SOURCE_SHA) throw Error("Published commit mismatch");
  '
curl --fail --silent --show-error --connect-timeout 5 --max-time 15 https://47.93.233.128/healthz
