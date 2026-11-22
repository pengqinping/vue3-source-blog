# Vue 3 源码手记 · 12 篇系列

> Vue 3 源码学习博客全套稿件。源码版本锁定 **v3.5.46**（2026-11-20 发布的最新稳定版）。
> 每篇 = 真实源码摘录 + 图示 + 可运行 mini 实现 + 面试考点，已按微信公众号发布规范排版并通过自检。

## 一、系列总览

| # | 标题 | 图示 | mini demo | 篇幅 |
|---|---|---|---|---|
| 00 | [一张地图看懂全貌](articles/00-vue3-架构全景.md) | 00-arch | — | 9.3K |
| 01 | [Proxy 响应式的地基](articles/01-reactive-proxy.md) | 01-track-trigger | 01-mini-reactive.mjs | 11.1K |
| 02 | [effect 与依赖收集的心脏](articles/02-effect-deps.md) | 02-dep-link | 02-mini-effect.mjs | 11.0K |
| 03 | [ref/computed 缓存真相](articles/03-ref-computed.md) | 03-computed | 03-mini-ref-computed.mjs | 8.1K |
| 04 | [watch 与调度器](articles/04-watch-scheduler.md) | 04-scheduler | 04-mini-watch.mjs | 8.6K |
| 05 | [编译器三步走](articles/05-compiler-pipeline.md) | 05-compiler | 05-mini-compiler.mjs | 13.0K |
| 06 | [patchFlag 与 Block](articles/06-compile-optimize.md) | 06-block-tree · 07-patch | 06-mini-renderer.mjs | 10.9K |
| 07 | [渲染器 patch 全流程](articles/07-renderer-patch.md) | 07-renderer-flow | 06-mini-renderer.mjs | 9.8K |
| 08 | [diff 算法与 LIS](articles/08-diff-lis.md) | 08-diff | 07-mini-diff.mjs | 10.6K |
| 09 | [setup 与生命周期真相](articles/09-component-lifecycle.md) | 09-lifecycle | 08-mini-lifecycle.mjs | 8.5K |
| 10 | [KeepAlive LRU 缓存](articles/10-built-in-components.md) | 10-keepalive | 09-mini-keepalive.mjs | 9.4K |
| 11 | [性能优化与考点汇总（终章）](articles/11-performance-summary.md) | 11-roadmap | 全部 | 6.6K |

全部 12 篇已通过公众号 preflight 自检：标题 ≤32 字、摘要 ≤120 字、正文渲染后远低于 2 万字符上限、图片均 <1MB。

## 二、目录结构

```
vue3-source-blog/
├── articles/     12 篇公众号正文（frontmatter 已配好：标题/封面/摘要/主题）
├── covers/       12 张公众号封面（1200×512，Chrome headless 生成）
├── diagrams/     13 张 mermaid 图示源码（.mmd）+ 渲染 PNG
├── demos/        9 个 mini 实现，node 直接运行（零依赖）
├── source-ref/   v3.5.46 真实源码备份（28 个文件，摘录出处可溯源）
├── html-tpl/     封面生成模板（改标题后可重新截图）
├── xiaohongshu/  小红书图文文案（12 篇，含标题/正文/标签）
├── douyin/       抖音口播脚本（12 条，45~60 秒/条）
└── README.md     本文件
```

## 三、mini demo 运行

```bash
node demos/01-mini-reactive.mjs        # Proxy 拦截 + track/trigger
node demos/02-mini-effect.mjs          # ReactiveEffect + 双向清理 + 嵌套
node demos/03-mini-ref-computed.mjs    # ref 拦截点 + computed 脏标记
node demos/04-mini-watch.mjs           # watch + 调度队列 + nextTick
node demos/05-mini-compiler.mjs        # 模板→AST→codegen→render 全链路
node demos/06-mini-renderer.mjs        # patch 三分友 + patchFlag 快通道
node demos/07-mini-diff.mjs            # diff 五步走 + LIS 耐心排序
node demos/08-mini-lifecycle.mjs       # 父子生命周期顺序还原
node demos/09-mini-keepalive.mjs       # KeepAlive LRU 淘汰
```

文章中的「运行实录」全部来自以上脚本的真实输出，未做手工修饰。

## 四、公众号发布流程（wechat-publish skill）

```bash
# 1. 自检（每次发布前必跑）
node ~/.agents/skills/wechat-publish/scripts/wx.mjs preflight articles/01-reactive-proxy.md

# 2. 预览渲染效果（不发请求）
node ~/.agents/skills/wechat-publish/scripts/wx.mjs render articles/01-reactive-proxy.md -o /tmp/01.html

# 3. 写入草稿箱（图片自动压缩上传，永不自动群发）
node ~/.agents/skills/wechat-publish/scripts/wx.mjs publish articles/01-reactive-proxy.md --theme tech
```

**注意事项**：
- frontmatter 中的 `author: 前端源码笔记` 是占位，发布前请替换成你的公众号作者名；
- 主题当前为 `theme: tech`（藏蓝），如需黑黄撞色改为 `magazine`；
- 首次使用先跑 `wx.mjs doctor` 检查凭证与 IP 白名单（`40164` = IP 未加白）；
- 草稿箱写入后，原创声明/合集/定时群发需要在后台人工确认（skill 红线：绝不自动发布）。

## 五、多平台发布节奏建议

- **公众号**：每周 2 篇（周二/周五早 8 点），12 篇约 6 周更完，每篇文末互相导流；
- **小红书**：与公众号同周期发布同主题图文卡（文案见 `xiaohongshu/文案汇总.md`），封面用 `covers/xx.png`，正文贴 1~2 张 diagram 截图；
- **抖音**：每篇对应一条 45~60 秒口播（脚本见 `douyin/口播脚本汇总.md`），画面同步展示 diagram，结尾 CTA 引流公众号看全文；
- 三平台错峰 1 天（公众号先发，小红书/抖音次日），让站外流量在公众号二发时落地。

## 六、源码摘录规范（本系列约定）

- 所有源码摘录均可在 `source-ref/` 对应路径找到原文（与 GitHub `vuejs/core` tag `v3.5.46` 一致）；
- 摘录处标注了文件与行号区间（如 `baseHandlers.ts L112`），长函数以「节选」标注删减；
- mini 实现刻意做了简化（如用 Set 代替 Dep/Link 链表），文章中均已显式声明简化点与真实实现的差异。
