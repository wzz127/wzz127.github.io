# 公众号草稿：已验证流程

2026-11-13 已将《为什么我越说“别碰”，孩子越想碰？》存入公众号草稿箱，回读确认标题、33 段正文、封面、作者和原文链接一致。未发布。回执：`child-dont-touch-api-receipt.json`。

## 固定路线

- 从阿里云 `root@47.93.233.128` 经 SSH 调用微信 API。实际出口已实测为 `47.93.233.128`。
- 公众号 AppID：`wx1bf804df4cb55d13`。凭据读取本机 `~/.hermes/.env` 的 `WECHAT_MP_APPID` / `WECHAT_MP_SECRET`。
- 用户已明确授权：通过加密 SSH 临时将这两项凭据传到这台服务器，为本博客创建草稿；以后按此方法处理。该约定不扩展到其他服务器、其他用途或直接发布。
- 使用 `POST /cgi-bin/stable_token`，`force_refresh: false`。不要再默认使用 Hermes 旧脚本的 `GET /cgi-bin/token`。
- JSON 请求使用 UTF-8、`ensure_ascii=False`；响应从原始字节按 UTF-8 解码，不能依赖 `requests.Response.encoding`。
- 永久素材接口上传现有封面和正文图片，并将正文图片地址换成微信返回的素材 URL。本次 PNG 约 2.7 MB，实际上传成功，无须重新生成或压缩封面。
- 只调用草稿创建、列表和读取接口；脚本没有发布接口或 `--publish` 参数。

## 操作命令

在仓库根目录执行。本地需要 Python 3 和项目现有 Node 依赖；服务器只需 Python 3.6+ 与 `requests`，不安装软件，不修改线上博客服务。

```bash
# 本地检查：不读取凭据、不连接网络
python3 tooling/wechat-draft.py prepare --post source/_posts/child-dont-touch.md

# 检查接口及同名草稿
python3 tooling/wechat-draft.py inspect --post source/_posts/child-dont-touch.md

# 创建草稿；已有回执或同名草稿时只核对，不重复创建、不覆盖
python3 tooling/wechat-draft.py create --post source/_posts/child-dont-touch.md

# 根据回执中的 media_id 回读核对
python3 tooling/wechat-draft.py verify --post source/_posts/child-dont-touch.md
```

下次将 `--post` 换成目标文章路径即可。用户说“最新一篇”时，以文章 front matter 的 `date` 选择，不能按文件修改时间选。脚本自动使用 `wechat-drafts/<slug>.html` 已审核排版稿；若不存在，则从原文 Markdown 渲染为简单排版。也可用 `--html /绝对路径/稿件.html` 指定排版稿；完整网页必须以 `<article>` 包住正文。文字和图片必须与 Markdown 原文一致，否则停止。

默认 SSH 私钥为 `~/Downloads/codex.pem`，可用 `--ssh-key` 指定；保持严格主机密钥检查。`--env-file` 可指定凭据文件，不把凭据作为命令行参数。文章需有 `title`、`date`、`cover`，图片必须是博客 `source/` 下已有的 PNG/JPG/GIF。外链图片、SVG 或主动内容会被拒绝，先准备符合公众号要求的现有素材；需要生成或编辑图片时遵守项目图片 skill。

## 验证与防重复

1. 本地核对排版稿与原文文字、图片；检查封面存在。
2. 服务器通过稳定版令牌接口鉴权，然后分页检查同名草稿。
3. 存在一个同名草稿则回读比较；多个同名草稿或正文不一致时停止，不覆盖。
4. 上传素材，创建草稿，立即输出 `draft_media_id`，随后按 ID 回读核对。
5. 本地保存 `wechat-drafts/<slug>-api-receipt.json`，无密钥、无令牌。创建后校验失败仍保存 ID。已有回执时 `create` 自动转为只读验证。
6. SSH 超时或网络中断后先检查草稿箱和回执，不盲目重试写入。已删除的草稿若需要重建，先确认旧草稿不存在，再人工处理旧回执。

凭据通过 SSH 标准输入传入服务器，凭据和 token 仅在进程内存中；不复制整个 `.env`，不写入服务器环境文件、仓库、命令行或日志。服务器仅保留空的 `/tmp/ai-blog-wechat-draft.lock` 防并发锁文件。SSH 标准输入也包含文章和图片，任务结束后进程退出。仍需遵守运行环境对网络访问的审批。

## 本次遇到的问题

- 浏览器访问公众号后台被工具安全策略阻止，后续直接沿用 API，不反复尝试浏览器。
- 本机出口 `39.162.75.221` 和服务器出口 `47.93.233.128` 曾多次被旧 token 接口报告 `40164`；用户已核对 AppID 并保存白名单，继续重复同一旧接口没有推进任务。
- 同一服务器、同一凭据改为 `stable_token` 后，成功获取令牌、读取草稿、上传图片及创建草稿。这是实测差异，不能据此断定旧接口失败的根因，也不能把稳定版接口当成绕过白名单的方法。
- 服务器是 Python 3.6.8，Hermes 原脚本的 `from __future__ import annotations` 无法运行。项目内 worker 已直接兼容 Python 3.6，不再临时改写 Hermes 脚本。
- 首次回读中文乱码是客户端响应解码问题。改为 UTF-8 后同一草稿读取正常，无须重新写入。

本地回归：`python3 -m unittest discover -s tooling -p 'test_wechat_draft.py'`。此命令不连接微信，也不生成新草稿。

## 保存流程时的复核

2026-11-13，项目内脚本的本地 4 项回归通过，Python 3.6 语法检查通过，真实 `inspect` 成功读取公众号草稿箱。复核时草稿箱已为空，原 ID 返回 `40007 invalid media_id`；此前成功创建和回读的回执仍作为历史记录保留。本次没有重新创建。无法仅凭此返回判断文章是被删除还是已发布，不能把历史 `verified: true` 当成当前仍在草稿箱的证明。

整理后的脚本已实测鉴权及列表读取；新建接口的线上证据来自本次此前成功的同路线临时脚本。为避免新增重复稿，没有用整理后的脚本再建一篇。
