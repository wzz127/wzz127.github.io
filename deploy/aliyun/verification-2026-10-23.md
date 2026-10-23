# 2026-10-23 博客部署与磁盘检查

时间：北京时间 2026-10-23 下午。目标服务器：阿里云北京 `47.93.233.128`，2 核 2GB，40GB 系统盘。

## 部署结果

- 地址：<https://blog.kfad127.xyz>。
- 发布：`blog-20261023-140819-47752dafdb9d`，基于当前工作区（含本次尚未提交的域名和部署配置修改）。
- 站点基础 URL、canonical、RSS、搜索索引已使用新域名；页脚显示 `豫ICP备2026017642号-1` 并链接工信部。
- 新增 DNS `blog A 47.93.233.128`，已启用，TTL 600 秒。旧 `@` 和 `_dnsauth` 记录仍暂停，未修改。
- 独立 `ai-blog-static` 容器健康，映射 `127.0.0.1:18080`。运行内存实测约 10.7MiB，内存限额 64MiB、CPU 限额 0.25。
- 现有 Caddy 校验后平滑加载新增站点，Let's Encrypt 域名证书成功签发，TLS 验证结果为 0。
- 本地构建检查 34 个 HTML 页面、11 篇文章，12 项现有测试全部通过。
- 经正式域名 HTTPS 逐一获取 66 个文件，SHA-256 与本地全部一致。
- HTTP 自动跳转为 308，缺失路径返回 404。
- 浏览器核对首页、文章、备案链接、搜索筛选；脚本错误日志为空。统计接口在页面加载后返回阅读人数和次数。
- 外部 giscus 配置及 pathname 匹配沿用；没有发表测试评论。

## sanxing 验证

- <https://47.93.233.128/> 浏览器正常显示当前会话的家长解锁页面。
- `/healthz` 返回 `ok: true`，运行版本仍为 `grade-20261023-091211-8c22a4effd50`。
- Caddy 配置加载期间 16 次 HTTPS 健康探测全部成功。
- `sanxing-web`、`sanxing-caddy`、`sanxing-music`、`sanxing-images`、`resource-search-app-1` 的容器 ID、启动时间、重启次数、镜像 ID 与接入前完全一致。
- sanxing 的目录、Compose、业务数据卷、音乐登录态和证书续期脚本未改动。
- 没有触发收费模型对话、语音或生图请求；本次验证不替代这些功能的完整业务回归。

## 磁盘现状与清理建议

部署后系统盘仍为约 28GB 已用、11GB 可用、使用率 74%。没有执行历史文件、镜像、缓存或备份删除。

| 位置/类别 | 实测占用 | 建议 |
| --- | ---: | --- |
| `/home/admin/video-ai-processor/workspace/processed` | 11.53GiB | 历史视频处理输出；确认已下载或不再需要后再清理，是最大可检查对象 |
| `/home/admin/video-ai-processor/workspace/cuts` | 0.84GiB | 视频片段；与上项合计约 12.36GiB，同样先确认留存需求 |
| `/data/video_workspace` | 1.06GiB | 其中 raw 约 0.59GiB、processed 约 0.46GiB；原始素材不应按缓存直接删除 |
| Docker Build Cache | 私有可回收约 1.15GB（十进制） | 优先候选，可重建；删除后下次构建会变慢，不应与业务数据卷混同 |
| Docker 镜像 | 77 个镜像，Docker 报告 6.376GB 可回收 | 包含大量 `sanxing-rollback`、旧视频和资源搜索镜像。先保留运行镜像、近期回滚镜像以及 Certbot 续期镜像；不要直接运行全量 `prune -a` |
| `/opt/sanxing/backups` | 1.06GiB | 历史发布及数据库备份。可以制定保留近期版本和关键里程碑的规则，再归档旧版本；不能当作普通临时文件 |
| `/var/cache/dnf` | 218MiB | 可重新获取的软件包缓存，属于较低风险候选 |
| systemd journal | 184MiB | 体量不大，优先保留近期排障记录 |
| Docker 容器日志 | 最大约 5.7MiB，其余很小 | 暂无清理价值 |
| `/tmp` | 约 34MiB | 多为上传和验收材料，清理收益很小 |

Docker 的镜像与构建缓存存在共享层，上表空间不能简单相加。镜像可回收数字也不代表全部都应该删除：部分未被容器引用的镜像专门用于回滚或定时证书续期。

建议顺序：先清理经过确认的构建缓存和包管理缓存；随后核对旧视频输出是否还有留存价值；最后再制定 sanxing 备份及回滚镜像的保留规则。保留所有运行容器的数据卷、`/opt/sanxing/secrets`、SQLite 数据、Caddy 数据卷和现有 IP 证书目录。

## 证据

- [博客首页截图](../../.deploy-aliyun/evidence/blog-home.png)
- [sanxing 页面截图](../../.deploy-aliyun/evidence/sanxing.png)
- [DNS 新记录截图](../../.deploy-aliyun/evidence/dns.png)
- [线上文件校验结果](../../.deploy-aliyun/evidence/https-verification.json)
- 服务器基线、原配置和接入检查结果：`/opt/ai-blog/backups/blog-20261023-140819-47752dafdb9d/`。
