工程已拉取并完成分析，检查日期为 2026-10-14。

**修复状态（2026-10-14）：下文保留首次分析时的问题记录。随后已恢复 Yilia 主题、升级 Hexo 8.1.2 和相关插件，补齐站点配置、RSS、图标、构建检查及 GitHub Pages Actions 工作流。当前运行与发布说明见 [README.md](/Users/xia/学习项目/ai-blog/README.md)。**

仓库：[wzz127/wzz127.github.io](https://github.com/wzz127/wzz127.github.io)。本地目录：`/Users/xia/学习项目/ai-blog`。当前分支为默认分支 `hexo`，源码提交为 `e210ac2`（2018-05-05，`blog源文件`）；远程 `master` 的最新提交为 `6398e77`（2018-05-05）。

**这是一个 Hexo 静态个人博客。文章和网站结构比较简单，但当前源码不能在本机直接生成可用网站，主要障碍是主题源码缺失和旧依赖与 Node.js 24 不兼容。**

文章中的 Hive、HBase、Impala 和 SQL 是博客内容。工程本身没有应用后端、业务数据库、账号系统或文章管理后台。写作方式是编辑 Markdown 文件，然后生成 HTML。

| 部分 | 技术及作用 |
| --- | --- |
| 构建环境 | Node.js、npm；锁文件固定 Hexo 3.7.1 |
| 文章 | Markdown 和 YAML front matter，描述标题、日期、分类、标签 |
| 页面模板 | EJS，由主题控制布局 |
| 样式 | CSS、Stylus；部分主题使用 jQuery |
| 页面生成 | 首页、文章、归档、分类、标签生成器 |
| JSON 索引 | `hexo-generator-json-content` 生成 `content.json`，供主题使用 |
| 本地服务 | `hexo-server` 提供开发预览 |
| 发布 | `hexo-deployer-git`，配置将生成结果推送到同一仓库的 `master` 分支 |

主要文件分布如下：

```text
ai-blog/
├── _config.yml                   站点、URL、主题、部署配置
├── package.json                  Hexo 及插件依赖
├── package-lock.json             2018 年的依赖锁文件，lockfileVersion 为 1
├── scaffolds/                    新文章、页面、草稿模板
├── source/_posts/                3 篇 Markdown 文章
└── themes/
    ├── yilia/                    当前启用的主题；目录为空，仅有 Git 子模块引用
    ├── miccall/                  目录为空，仅有 Git 子模块引用
    ├── landscape/                已提交的备用主题
    ├── TKL/                      已提交的备用主题
    └── hexo-theme-slice-master/   已提交的备用主题
```

`source/_posts/` 中有 `Hello World`、`hive 与 hbase`、`impala测试` 三篇文章，共 593 行 Markdown。两个技术文章属于 `Hadoop` 分类，标签分别为 `hadoop` 和 `impala`。

正常工作流程是：

```text
Markdown + 站点配置 + 主题模板
    → Hexo 生成 public/ 中的 HTML、CSS、JS、content.json
    → 部署工具将产物发布到 master
    → 静态托管服务向浏览器提供文件
```

`hexo` 分支保存源文件，`master` 保存已生成网站，两者用途不同。检查 `master` 后确认它包含 25 个文件，其中有 10 个 HTML 页面。它的首页引用 Yilia 的样式和脚本，但这些发布产物不能代替主题源文件与主题配置。GitHub Pages 当前采用什么发布设置、线上是否可访问，本次没有检查。

**需要优先解决的问题，按影响排序：**

1. **当前主题无法完整检出。** [站点配置](/Users/xia/学习项目/ai-blog/_config.yml:82) 指定 `theme: yilia`，但 `themes/yilia` 在 Git 中的类型为 `160000`，只记录了提交 `5cd9ba5a98fa4aad18a82e2344390dab1aae7685`；`miccall` 也只有类似引用。仓库没有 `.gitmodules`，缺少子模块地址映射，本次克隆后两个目录都为空。`git submodule status` 实际报错：`no submodule mapping found in .gitmodules for path 'themes/miccall'`。简单追加递归拉取参数不能解决缺少映射的问题。需要补齐主题来源、源码和配置，或者选择已完整提交的主题。

2. **旧依赖在当前 Node.js 下无法处理文章。** 本机为 Node.js `v24.21.0`、npm `11.19.0`。执行 `hexo generate --debug` 时，三篇文章全部出现 `TypeError: isDate is not a function`。根因是 `hexo-front-matter@0.2.3` 使用 `require('util').isDate`，当前 Node.js 已没有这个 API。此次生成只产生一个空的 `content.json`，没有任何 HTML。命令仍返回退出码 `0`，因此后续自动部署必须检查构建日志和关键产物，不能只判断退出码。仅恢复主题仍不足以解决这个独立的运行时问题。

3. **依赖需要成组升级。** `npm audit` 返回 64 个受影响的包项：19 critical、25 high、14 moderate、6 low，包含依赖关系传播后的记录；这个数量不是 64 个彼此独立且在线上可利用的漏洞。主要涉及旧 EJS、Lodash、YAML、Markdown 解析以及部署工具依赖。它们大多在本地构建、开发服务或部署过程中使用，需要结合输入来源评估实际影响。建议一起升级 Hexo、渲染器、生成器和部署插件，并验证主题兼容性；审计建议包含跨主版本升级，不适合直接执行强制自动修复。

4. **站点元数据仍是模板默认值。** [URL 配置](/Users/xia/学习项目/ai-blog/_config.yml:17) 为 `http://yoursite.com`，历史 HTML 的 Open Graph 地址及 JSON 中的标签永久链接也带有这个占位域名。应按最终域名配置 HTTPS URL；如果继续使用该用户站点，可配置为 `https://wzz127.github.io`。`language`、`timezone`、`description` 也未配置。`Hello World` 没有明确日期，当前 Hexo 会回退到文件创建时间，重新克隆后可能改变文章日期、排序和永久链接；应补齐历史日期并明确时区。

5. **历史页面存在缺失资源或目标。** 扫描 `master` 的全部 10 个 HTML 页面，发现它们都引用 `/atom.xml`、`/favicon.png` 和 `/tags/生活/`，而这些目标没有出现在发布分支。根依赖没有 RSS 生成插件 `hexo-generator-feed`，源码也没有生活标签文章或站点 favicon。应补齐资源、生成器和文章，或者调整相应链接。本结论来自仓库产物检查，没有向线上发起请求。

6. **备用主题也需要配置与验证。** `landscape` 的配置、布局和资源已提交，适合作为恢复构建时的候选主题。TKL 默认开启 Fancybox，但其自身资源目录缺少模板引用的 `fancybox/` 文件。Slice 只有 `_config.yml.edit`，未准备实际主题配置；其 README 要求的 JSON 正文、分类等字段，也与当前为 Yilia 设置的 `jsonContent` 不一致。此外，Slice 模板会把 Gitalk 的 `secret` 写入浏览器脚本，若以后启用这个功能，需要重新评估认证方案；目前对应配置为空，未发现已填入的密钥。

7. **维护入口不完整。** 源码分支没有项目级 README、npm scripts、Node 版本文件、测试入口或 GitHub Actions 工作流。现有主题 README 不能代替这个站点的运行说明。应增加安装、写作、预览、构建和发布说明，并固定一个已验证的 Node 版本。

**本次验证的结果：**

| 操作 | 结果 |
| --- | --- |
| 克隆远程默认分支 | 成功，当前为 `hexo`，保留远程分支 |
| `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` | 成功，安装 316 个包；未运行依赖生命周期脚本 |
| `git submodule status` | 失败，缺少子模块映射 |
| `./node_modules/.bin/hexo generate --debug` | 文章处理报错，未生成 HTML；退出码却为 0 |
| `npm audit --json --registry=https://registry.npmjs.org` | 完成，报告 64 个受影响包项 |
| 历史发布产物检查 | 25 个文件、10 个 HTML 页面，发现三类缺失目标 |
| `hexo clean` | 成功，清理此次不完整的构建产物和数据库缓存 |

**建议的恢复顺序：**

1. 如果希望保留历史外观，先找回 Yilia 的源码、相应版本和自定义配置，补齐子模块信息或直接纳入仓库；如果只需要先恢复博客，评估使用已提交的 Landscape。
2. 升级 Hexo 和相关插件，在选定 Node 版本上验证 Markdown、代码高亮、主题渲染和静态资源。旧 Node 环境只能用于历史复现，不宜作为长期维护方案。
3. 修正域名、语言、时区、文章日期、RSS、favicon 和导航链接，尽量保持已有技术文章的 URL。
4. 增加运行文档与 npm scripts，构建检查至少确认首页、三篇文章、分类、标签和 JSON 索引存在且内容正确，然后再配置自动发布。

本次未修改原有源码、配置或锁文件，未执行部署或推送。保留了本地依赖用于后续工作，只新增这份分析文档。
