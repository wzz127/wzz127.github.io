# 阿里云博客部署

正式地址：<https://blog.kfad127.xyz>。服务器：`47.93.233.128`，北京，2 核 2GB。

## 运行结构

- DNS：`blog` 的 A 记录指向 `47.93.233.128`，TTL 600 秒；原主域名记录未变更。
- `/opt/ai-blog/compose.yml`：独立 Compose 项目 `ai-blog`，容器 `ai-blog-static`。
- 静态服务只映射到 `127.0.0.1:18080`，由现有 `sanxing-caddy` 代理；不新增公网业务端口。
- 容器限额：64MiB 内存、0.25 CPU、64 个进程，静态文件只读挂载，日志最多 2 × 5MB。
- Caddy 镜像自带 `NET_BIND_SERVICE` 文件能力，容器能力集合保留这一项以使二进制能启动。进程使用非 root 用户，并启用 `no-new-privileges`。
- `/opt/ai-blog/site/releases/<release>/` 保存各次发布；`site/current` 是容器读取的目录符号链接。挂载其父目录，切换链接后无需重建容器。
- `/opt/sanxing-https/Caddyfile` 只追加本目录的 `Caddyfile.fragment`。原 IP 站点、IP 证书、Certbot 定时器、sanxing Compose 和数据卷保留。
- 域名证书由现有 Caddy 自动申请和续期。备份恢复时必须保留 Caddy 的 `/data` 卷。

## GitHub 自动部署

推送 `hexo` 分支或手动运行 `.github/workflows/pages.yml` 即可发布；Discussions 变更也会触发评论数刷新。PR 只执行构建和检查。生产发布串行执行，不取消正在进行的发布。

阿里云发布完整的 `public/`；验证成功后，GitHub Pages 发布独立的 `.deploy-pages/` 跳转页，将旧域名的首页和文章链接跳转到 `blog.kfad127.xyz` 的相同路径，并保留查询参数和锚点。

仓库 Secrets 为 `BLOG_DEPLOY_KEY` 和 `BLOG_KNOWN_HOSTS`。专用 `blog-deploy` 账号没有 sudo 或 Docker 权限；SSH 强制运行 root 管理的 `/usr/local/bin/ai-blog-receive`，只接受 `publish <40位提交SHA>` 和限额内的静态文件包，禁止交互命令、转发、路径穿越及符号链接。

接收器只写 `/opt/ai-blog/site`，保存独立版本并原子切换 `current`；验证公网博客提交号和 sanxing 健康状态，失败恢复原链接。日常发布不修改 Caddy 或 sanxing 服务。更新接收器代码需要管理员单独安装，Actions 无权修改它。

## 手工更新静态文件（应急）

下面在本地工作区运行。`BLOG_SSH_KEY` 是本机已有的 PEM 路径，不要把 PEM 或账号凭据放入仓库。

```bash
npm test
export BLOG_SSH_KEY=/本机私钥路径/codex.pem
release="blog-$(TZ=Asia/Shanghai date +%Y%m%d-%H%M%S)"
artifact="$(mktemp -t ai-blog).tar.gz"
tar -czf "$artifact" -C public .
ssh -i "$BLOG_SSH_KEY" -o StrictHostKeyChecking=yes root@47.93.233.128 \
  "mkdir -p /opt/ai-blog/uploads /opt/ai-blog/site/releases/$release"
scp -i "$BLOG_SSH_KEY" -o StrictHostKeyChecking=yes "$artifact" \
  "root@47.93.233.128:/opt/ai-blog/uploads/$release.tar.gz"
ssh -i "$BLOG_SSH_KEY" -o StrictHostKeyChecking=yes root@47.93.233.128 \
  "bash -s -- $release" <<'REMOTE'
set -euo pipefail
release="$1"
cd /opt/ai-blog
previous="$(readlink site/current)"
tar -xzf "uploads/$release.tar.gz" -C "site/releases/$release"
find "site/releases/$release" -type d -exec chmod 755 {} +
find "site/releases/$release" -type f -exec chmod 644 {} +
rollback() {
  ln -s "$previous" site/current.rollback
  mv -Tf site/current.rollback site/current
}
trap rollback ERR
ln -s "releases/$release" site/current.next
mv -Tf site/current.next site/current
curl -fsS --connect-timeout 5 --max-time 10 https://blog.kfad127.xyz/ >/dev/null
curl -fsS --connect-timeout 5 --max-time 10 https://47.93.233.128/healthz
trap - ERR
printf '\nPublished %s\nPrevious release: %s\n' "$release" "$previous"
REMOTE
```

这种更新不修改 Caddy，也不运行 sanxing 的发布脚本。如果需要刷新文章列表评论数，在上传前按主 README 的说明运行 `npm run sync:comments`。正常 GitHub 自动发布已包含这些步骤，通常无需手工上传。

## 回滚

把 `site/current` 原子切换到已知的旧 `releases/<release>` 即可回滚博客，不需要重启 sanxing。首次接入前的 Caddy 原配置、Compose 原文件、容器状态和健康状态保存在 `/opt/ai-blog/backups/blog-20261023-140819-47752dafdb9d/`。

如需撤销域名接入，先用上述备份恢复原 Caddyfile 的**文件内容**，校验后 reload。现有容器按单文件 bind mount 挂载 Caddyfile，直接用另一个 inode 替换文件可能使容器继续读取旧文件。不要通过重建现有 Caddy 或重启 sanxing 来更新博客。

## 访客评论（首次上线需部署动态服务）

访客评论独立存储于 SQLite，默认 `pending`，仅 `approved` 可公开读取。昵称必填、邮箱选填且仅审核命令可见。GitHub/giscus 的历史讨论和登录入口保留，仍按 GitHub 原有规则发布，**不经过访客审核队列**。统计为 GitHub 评论数加已通过审核的访客评论数。访客接口不可用时总数显示 `--`。

静态发布账号不能安装服务。管理员需把 `deploy/comments/server.py` 放到 `/opt/ai-blog/comments/server.py`，更新 `/opt/ai-blog/compose.yml`，并执行：

```bash
cd /opt/ai-blog
install -d -m 700 -o 65534 -g 65534 comments-data
# 只在首次配置时生成；已有 .env 时保留原内容并追加，不覆盖其他设置。
(umask 077; printf 'COMMENTS_SALT=%s\n' "$(openssl rand -hex 32)" >> .env)
docker compose -p ai-blog up -d comments
```

按 `Caddyfile.fragment` 更新博客域名块，校验 Caddy 配置后 reload。API 路由必须先于静态路由，代理必须覆盖 `X-Real-IP`；18081 只监听 loopback。然后发布本次静态构建。上线验证：提交一条评论后公开接口应为空，审核通过后才显示，返回 JSON 不含邮箱。不要把数据库、`.env` 或审核输出放入静态目录或 Git。

审核操作（通过服务器管理员 SSH 执行）：

```bash
cd /opt/ai-blog
docker compose -p ai-blog exec comments python /app/server.py pending
docker compose -p ai-blog exec comments python /app/server.py approve 123
docker compose -p ai-blog exec comments python /app/server.py reject 123
```

`123` 替换成待审核评论 ID；reject 也可撤下已公开评论。列表最多显示最近 100 条已通过评论。每个来源一分钟最多提交一次、每小时最多五次，数据库只保存加盐 IP 摘要。没有邮件通知或自动回复功能。备份请使用 SQLite `.backup` 或停评论容器后复制 `comments-data`，与静态版本备份分开保存；静态发布与回滚不会删除评论。

本地测试：`python3 -m unittest discover -s deploy/comments -p 'test_*.py'`。
