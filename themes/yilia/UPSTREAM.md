本目录来自 [litten/hexo-theme-yilia](https://github.com/litten/hexo-theme-yilia)，版本为原工程记录的提交 `5cd9ba5a98fa4aad18a82e2344390dab1aae7685`（2017-11-15）。上游 package.json 声明许可证为 ISC。

主题作为普通文件随站点保存，克隆后无需初始化子模块。原工程另一个没有地址映射且未使用的 `miccall` 子模块引用已移除；其他完整备用主题保留。

`layout/`、`languages/` 和 `source/` 是 Hexo 生成站点所需的模板、语言文件和已编译静态资源。`source-src/` 保留上游的样式和脚本源码供参考。上游 webpack 1 / node-sass 3 构建工具不支持当前 Node 环境，因此未纳入站点依赖；正常构建直接使用已编译资源，不需要在主题目录执行 npm install。

站点配置放在根目录 `_config.yilia.yml`。本地对模板的兼容与链接修正，以及前端资源调整，应在本文件中记录，升级主题前先比较这些改动。

本地调整：

- 文章详情、首页、归档和分类/标签列表共用 `post/stats.ejs`，展示单篇阅读人数、阅读次数与评论数。`post-stats.js/css` 独立维护，使用支持 UV/PV 及只读查询的不蒜子兼容接口；预览不上报访问。giscus 启用 metadata，评论列表从构建时生成的 `post-comments.json` 读取。

- 作者和副标题从站点配置读取，适配 Hexo 8；增加 HTML 语言与 canonical 地址，修正 RSS 的 alternate 属性，允许移动端缩放。
- 删除主题默认配置中的示例菜单、社交占位链接和 localhost 友链，避免 Hexo 合并配置时将它们带入站点。
- 分类链接去掉重复斜杠，标签增加真实页面链接，静态资源使用 url_for；头像增加替代文本和明确尺寸，修复 SVG 在桌面头像容器中的零尺寸问题。
- 将 script.ejs 中的内联移动端脚本（含浏览器补丁）提取到 source/mobile.992cbe.js，仅加载一次，以 defer 按移动端、主脚本、搜索面板的顺序执行；无需 webpack。
- 移除 main.0cf68a.js 中模块 192 的上游错误上报与来源 Cookie 操作，source-src/js/report.js 同步改为空操作。其余已有交互资源保持原样。
- 文章索引加载失败时显示刷新提示；开发安装说明放在项目 README。
- package.json 只保留主题元数据与许可证声明；移除旧 webpack/Babel 构建配置。source-src 作为上游源码参考，站点依赖统一由根目录管理。

## 2026-10-23 Journal 视觉改造

- 使用独立的 `journal-*.ejs`、`journal.css`、`journal.js` 和 `journal-theme.js` 替换页面外观与交互入口；参考已确认的暖白、蓝灰博客原型。旧版编译资源保留，但页面不再加载旧侧栏脚本。
- 首页、分类、标签、年月归档、文章详情与关于页采用新布局，保持 Hexo 路由和分页。统计组件、正式域名才计数的保护、giscus pathname/strict 映射与 RSS 沿用。
- 搜索保留原 `content.json` 数组结构，增加纯文本正文。新交互提供加载失败重试、键盘搜索、图片放大、阅读进度、回到顶部和持久化深浅色；评论框同步主题。
- 活跃外观源文件位于 `source/journal*`，直接编辑即可构建，不需要旧 webpack。
