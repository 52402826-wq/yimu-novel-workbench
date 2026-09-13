# 乙木

本地小说创作工作台。1.0 采用“合并版小说工作台”架构：不是堆很多孤立页面，而是用同一份小说数据生成正文、故事、世界、线索、资料、关系和 AI 上下文。

## 路径

- 程序路径：`/Users/ray/Projects/NovelWorkbench`
- 创作数据路径：`/Users/ray/Documents/NovelWorkbenchData`
- SQLite 数据库：`/Users/ray/Documents/NovelWorkbenchData/novel-workbench.db`

程序代码和创作数据分离。上传 GitHub 时只上传工作台代码，不上传小说资料、数据库或模型 API Key。

## 1.0 能力

- 新建小说项目
- Story Tree：卷 / 章 / Scene / Beat
- 正文编辑器
- 自动保存
- Scene 元数据：POV、目标、冲突、结果、摘要、故事时间、状态
- World Entities：人物、地点、势力、物品、规则、事件、术语
- Narrative Threads：伏笔、悬念、任务、秘密、感情线、冲突线
- Library：灵感、研究资料、摘录、参考、笔记
- Relations：Scene 与世界条目、线索、资料的统一关系
- Dashboard：字数、章节、Scene、世界条目、未回收线索
- 全局搜索：正文、世界、线索、资料
- AI Context：聚合当前上下文，支持本地配置模型 Provider

## 启动

推荐使用稳定启动入口：

```bash
pnpm workbench:start
```

或者在 Finder 里双击：

```text
/Users/ray/Projects/NovelWorkbench/start-workbench.command
```

启动脚本会先检查 `/Users/ray/Documents/NovelWorkbenchData` 是否可写。如果数据目录被 macOS 权限拦截，脚本会停止启动并给出提示，避免工作台打开后新建、删除、保存突然失败。

固定访问地址：

```text
http://localhost:3007
```

如果页面打不开、显示断链，重新运行 `start-workbench.command` 即可。

开发模式：

```bash
pnpm install
pnpm dev
```

打开本地地址后即可开始写作。

生产模式：

```bash
pnpm build
pnpm start
```
