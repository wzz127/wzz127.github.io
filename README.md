# k-fad 的博客

基于 Hexo 8.1.2 和 Yilia 的静态博客，站点地址为 <https://wzz127.github.io>。文章保存在 `source/_posts/`，源码分支为 `hexo`。Yilia 源码已随工程保存，普通克隆即可使用。

## 本地运行

使用 Node.js 24.21.0（见 `.nvmrc`）和 npm 11。安装了 nvm 时可执行 `nvm install && nvm use`。

```bash
git clone --branch hexo https://github.com/wzz127/wzz127.github.io.git
cd wzz127.github.io
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

打开 <http://127.0.0.1:4000>。安装依赖只在工程根目录执行；主题运行时无需安装其旧版 webpack 或 node-sass 工具。

| 命令 | 用途 |
| --- | --- |
| `npm start` | 启动本地预览并监听文件变化 |
| `npm run new -- "文章标题"` | 在 `source/_posts/` 创建文章 |
| `npm run build` | 清理旧产物、生成网页、检查页面和静态资源 |
| `npm run check` | 单独检查已经生成的 `public/` |
| `npm test` | 构建检查，并验证缺页、缺资源、搜索格式错误、历史日期变化会被拦截 |
| `npm run clean` | 清理生成目录和 Hexo 缓存 |
| `npm audit` | 查看依赖安全公告 |

## 文章与配置

新文章使用以下 front matter，日期按 `Asia/Shanghai` 解释：

```yaml
---
title: 文章标题
date: 2026-10-14 12:00:00
tags:
  - hadoop
categories:
  - Hadoop
---
```

正文摘要结束的位置可以加入 `<!-- more -->`。需要明确记录修改日期时添加 `updated` 字段；没有该字段时使用发表日期，避免重新克隆后文件时间改变 RSS 内容。

- `_config.yml`：域名、语言、时区、文章 URL、分页和 RSS。
- `_config.yilia.yml`：菜单、头像、社交链接、目录和关于信息。
- `source/favicon.svg`：站点图标，当前也用于头像。
- `scripts/search-index.js`：生成 Yilia 使用的数组形式 `content.json`，包含标题、日期、路由和标签。
- `tooling/`：构建入口、发布产物检查和对应测试。
- `themes/yilia/UPSTREAM.md`：主题来源、固定版本和本地修改记录。

三篇原有文章的 URL 保持不变：

```text
/2018/05/02/hello-world/
/2018/05/04/hive与hbase/
/2018/05/04/impala测试/
```

## GitHub Pages 发布

使用 [Hexo 官方 GitHub Pages 指南](https://hexo.io/docs/github-pages) 中的 GitHub Actions 发布方式。仓库已切换为 GitHub Actions 发布。如需重新配置，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。如果已有 `github-pages` 环境的分支限制，也应允许 `hexo` 分支部署。

提交并推送到 `hexo` 后，`.github/workflows/pages.yml` 会执行以下步骤：

1. 使用 `.nvmrc` 的 Node 版本和锁文件安装依赖。
2. 执行 `npm test`；检查首页、文章正文、历史日期与 URL、分类、标签、RSS、搜索索引、CSS 字体和页面引用的本地文件。
3. 拦截构建日志中的 ERROR/FATAL，以及 critical 级依赖审计问题。
4. 上传验证后的 `public/`，通过官方 GitHub Pages action 发布。

对 `hexo` 的拉取请求只构建与检查，不发布。Actions 页面也可以手动运行工作流，但发布仅允许 `hexo` 分支。Actions 的引用固定为提交 SHA，Dependabot 每周检查 npm 依赖和 Actions 更新。

新流程使用 GitHub 提供的 `GITHUB_TOKEN` 和 OIDC，不需要额外添加个人 Token 或 SSH 密钥。历史 `master` 分支仅保留原发布文件，不再作为新自动发布的目标；`public/` 不提交到源码分支。后续提交推送到 `hexo` 分支即可触发构建和上线。

只有仍采用 **Deploy from a branch → master** 的旧发布方式时，才使用以下手动命令。它会在通过构建检查后，使用 `_config.yml` 中的 SSH 地址发布到 `master`；需要本机已配置仓库写权限。不要与新的 Actions 发布方式混用。

```bash
npm run deploy:legacy
```

## 依赖审计与主题维护

2026-10-14 在 Node.js 24.21.0 上通过干净安装、构建和四项回归测试，验证了 10 个 HTML 页面、三篇文章、RSS 和本地资源。浏览器中检查了桌面与 390px 手机视图、搜索筛选和文章代码高亮，最终页面未记录到脚本错误；Pages 工作流通过 actionlint 语法检查。正式发布结果可在仓库 Actions 页面查看。

依赖审计从修复前的 64 个受影响包项（19 critical）降至 10 个（0 critical、8 high、2 moderate）。剩余公告来自 `braces@3.0.3` 和 `sprintf-js@1.1.3` 及其依赖关系传播；检查时 npm 没有提供这两个包的修复版本。详见 [braces 公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 和 [sprintf-js 公告](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)。

持续关注上游更新；不要执行 `npm audit fix --force`，其当前建议会将 Hexo 降级至旧版，并破坏本次恢复的运行环境。CI 以 critical 为失败阈值，会在审计输出中保留其他等级的公告。

Yilia 上游版本较老，此次保留它的布局与已编译交互资源，修复作者、副标题、资源链接和搜索配置，并移除了主题上游的遥测上报。恢复不代表主题全部浏览器依赖已现代化。`source-src/` 用于源码参考；若要重新编译主题脚本或 Sass，应先迁移上游的旧构建工具，而不是在主题目录安装旧依赖。
