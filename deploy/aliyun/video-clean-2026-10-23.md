# 2026-10-23 历史视频输出清理

北京时间 14:51:42，清理服务器 `47.93.233.128` 的以下两个目录内容，目录本身保留：

| 目录 | 清理前文件数 | 清理后 |
| --- | ---: | --- |
| `/home/admin/video-ai-processor/workspace/processed` | 79 | 空目录 |
| `/home/admin/video-ai-processor/workspace/cuts` | 134 | 空目录 |

删除前确认两者均为真实目录而非符号链接，目录下不存在挂载点，且没有进程打开其中的文件或将其作为工作目录。删除使用 `find <指定目录> -xdev -mindepth 1 -depth -delete`，仅处理这两个目录内容。

## 实际释放空间

| 指标 | 清理前 | 清理后 |
| --- | ---: | ---: |
| 系统盘使用率 | 70% | 36% |
| 系统盘已用字节 | 27,632,746,496 | 14,358,028,288 |
| 系统盘可用字节 | 12,313,505,792 | 25,588,224,000 |

按文件系统可用字节差值，本次释放 **13,274,718,208 字节，即约 13.27GB（12.36GiB）**。剩余约 **25.59GB（23.83GiB）**。

## 保留项与服务验证

- 原始视频目录 `/home/admin/video-ai-processor/workspace/raw`、整个 `/data/video_workspace` 和 `/opt/sanxing/backups` 的文件条目、类型、大小和修改时间摘要清理前后完全一致。
- 全部 Docker 镜像名称、标签及 ID 不变，历史回滚镜像保留；数据卷清单不变。
- 6 个现有容器的 ID、镜像 ID、启动时间、重启次数均不变。
- 博客首页、文章、主样式文件、搜索索引，以及 sanxing 首页和健康接口，全部通过 HTTPS 证书校验并返回 200。
- sanxing `/healthz` 仍返回 `ok: true`，版本为 `grade-20261023-091211-8c22a4effd50`。
- 清理期间两个站点的探测全部成功，未触发收费业务请求。

## 审计文件

- 服务器：`/opt/ai-blog/maintenance/video-clean-20261023-145142/`
- [清理摘要](../../.deploy-aliyun/maintenance/video-clean-20261023-145142/summary.json)
- [网站验证](../../.deploy-aliyun/maintenance/video-clean-20261023-145142/website-verification.json)
- 同目录保存清理前后目录元数据摘要及健康探测记录。
