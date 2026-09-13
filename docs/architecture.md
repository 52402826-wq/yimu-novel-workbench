# 乙木架构记录

## 核心原则

正文数据与程序代码分离。程序放在 `/Users/ray/Projects/NovelWorkbench`，创作数据放在 `/Users/ray/Documents/NovelWorkbenchData`。

1.0 的产品原则是：一份数据，多种视图。大纲、细纲、卡片、时间线、关系图和 AI 上下文不重复维护各自的数据，而是从统一对象和关系生成。

底层抽象：

- Node：小说对象，例如 Scene、人物、地点、线索、资料。
- Relation：对象之间的关系，例如 Scene 关联人物、线索关联章节。
- Document：正文、摘要、设定正文、资料正文。
- View：正文树、故事树、资料列表、AI 上下文等展示方式。

## 模块

- `src/features/workbench`：写作工作台界面
- `src/db`：SQLite + Drizzle 数据层
- `src/app/api`：本地 API
- `src/features/ai`：后续 AI Router 预留入口

## 1.0 数据对象

- Story Tree：`projects`、`volumes`、`chapters`、`scenes`、`beats`
- World Entities：`world_entities`
- Narrative Threads：`narrative_threads`
- Library：`library_items`
- Relations：`relations`

## 合并设计

- 大纲、细纲、卡片墙合并为 Story Tree。
- 人物、地点、势力、物品、规则、事件、术语合并为 World Entities。
- 伏笔、悬念、任务、秘密、感情线、冲突线合并为 Narrative Threads。
- 人物关系、事件因果、设定关联合并为 Relations。
- AI 不作为孤立聊天大厅，优先从当前 Scene 聚合上下文。

## AI Router 预留

当前不接真实模型，只保留 provider 类型和统一请求形状。后续可以接入 OpenAI、DeepSeek、Kimi、Claude、Gemini 以及 OpenAI Compatible 接口。
