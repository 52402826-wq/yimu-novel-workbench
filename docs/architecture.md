# 墨枝架构记录

## 核心原则

墨枝采用“代码与创作数据分离”的本地工作台设计。程序代码放在项目目录中，小说正文、设定资料、AI Provider 配置和 SQLite 数据库存放在用户自己的数据目录。

默认路径：

- 程序目录：`/Users/ray/Projects/NovelWorkbench`
- 数据目录：`/Users/ray/Documents/NovelWorkbenchData`
- SQLite 数据库：`/Users/ray/Documents/NovelWorkbenchData/novel-workbench.db`

公开仓库只保存工作台架构和源码，不保存用户的小说数据、数据库、导入资料或 API Key。

## 产品原则

墨枝不是把功能拆成互不相干的页面，而是围绕同一份小说数据生成不同视图：

- 正文：作者每天写作的主入口
- 世界：人物、地点、势力、规则、事件、术语
- 资料：外部素材、设定文档、摘录、研究笔记
- 时间轴：故事内部事件顺序
- 线索：伏笔、悬念、任务、秘密、感情线、冲突线
- 关系：章节、场景片段、人物、资料、线索之间的连接
- AI：基于当前章节、引用章节和关系上下文生成建议

## 底层抽象

- Project：一本小说
- Volume：卷
- Chapter：章节，也是正文写作的主要承载对象
- Scene：底层场景结构和正文标注片段，用于关系、时间轴和场景管理
- Beat：故事节拍，用于章节规划
- World Entity：世界设定对象
- Narrative Thread：叙事线索
- Library Item：资料库条目
- Relation：对象之间的关系

## 模块

- `src/features/workbench`：工作台主界面
- `src/features/ai`：AI Router 与模型 Provider 适配
- `src/features/import`：本地文档扫描和导入
- `src/db`：SQLite + Drizzle 数据层
- `src/app/api`：本地 API
- `scripts`：启动脚本

## 写作主线

章节是作者直接编辑的正文单位。为了支持后续的场景划分、关系分析、时间轴和 AI 上下文，系统仍保留底层 Scene 数据：

- 每个章节默认有一个底层场景，用于承载章节结构信息
- 选中文本后可以创建场景片段，用于标注、关联和后续分析
- 场景片段不直接替代原文，而是作为正文上的结构化标记

## AI Router

AI 页面负责配置 Provider 和用途绑定。正文页面负责实际创作使用：

- 右键/选中文本：生成分析、润色、改写、续写建议卡片
- 创作对话：选择引用章节后进行问答式讨论
- 模型配置：支持 OpenAI、DeepSeek、Kimi、Claude、Gemini 和 OpenAI Compatible 接口

AI API Key 保存在本机 SQLite 数据库中，不进入仓库。

## 公开仓库注意事项

提交前应确认：

- 不提交 `.env` 或 `.env.*`
- 不提交 SQLite 数据库
- 不提交 `NovelWorkbenchData`
- 不提交真实小说正文、设定资料、导入文档
- 不提交任何 API Key、Token、私钥或证书
