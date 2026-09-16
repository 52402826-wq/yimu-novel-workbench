# 墨枝

墨枝是一款本地运行的长篇小说创作工作台。它以正文写作为核心，把章节、世界设定、资料库、时间轴、线索、关系和 AI 创作对话放在同一个工作流里，适合用来搭建、整理和持续推进长篇小说项目。

项目默认把程序代码和创作数据分离：代码可以公开托管，小说正文、设定资料、数据库和 API Key 保留在本机。

## 功能概览

- 小说项目管理：新建小说、卷、章节
- 正文写作：章节级编辑、自动保存、手动保存、一键排版、两端对齐
- 写作视图：章节树、全文搜索、可拖拽左右栏、可保存的字体和背景偏好
- 标注系统：选中文本后标记伏笔、入轴、场景片段，并用不同颜色高亮
- AI 辅助：选中文本后生成分析、润色、改写、续写建议卡片
- 创作对话：支持选择引用章节，和模型讨论人物、节奏、大纲、设定
- 世界设定：人物、地点、势力、物品、规则、事件、术语
- 资料库：导入本地 Markdown / 文本文档，整理研究资料和设定材料
- 时间轴：记录情节事件和故事时间
- 线索：维护伏笔、悬念、任务、秘密、感情线、冲突线
- 关系：把章节、场景片段、人物、资料、线索关联起来
- AI Provider：本地配置 OpenAI、DeepSeek、Kimi、Claude、Gemini 或 OpenAI Compatible 接口

## 技术栈

- Next.js
- React
- TypeScript
- Tailwind CSS
- TipTap
- SQLite
- Drizzle ORM

## 数据与隐私

默认数据目录：

```text
/Users/ray/Documents/NovelWorkbenchData
```

默认数据库：

```text
/Users/ray/Documents/NovelWorkbenchData/novel-workbench.db
```

这些内容不会被提交到仓库。`.gitignore` 已经忽略：

- `.env`
- `.env.*`
- `*.db`
- `*.sqlite`
- `*.sqlite3`
- `data/`
- `backups/`
- `projects/`
- `NovelWorkbenchData/`

AI API Key 保存在本机 SQLite 数据库里。公开仓库前请确认不要提交真实小说资料、数据库文件或 API Key。

## 快速启动

安装依赖：

```bash
pnpm install
```

启动工作台：

```bash
pnpm workbench:start
```

默认访问地址：

```text
http://localhost:3007
```

也可以在 macOS Finder 里双击：

```text
start-workbench.command
```

启动脚本会检查数据目录是否可写。如果页面打不开，重新运行启动脚本即可。

更多说明见 [快速开始](docs/quick-start.md)。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm start
pnpm db:push
```

## 自定义配置

可以复制 `.env.example` 为 `.env.local`，按需修改：

```bash
cp .env.example .env.local
```

常用配置：

```env
NOVEL_WORKBENCH_DATA_DIR=/Users/yourname/Documents/NovelWorkbenchData
PORT=3007
```

不要把 `.env.local` 提交到仓库。

## 项目结构

```text
src/
  app/                 Next.js 页面和本地 API
  db/                  SQLite + Drizzle 数据层
  features/
    ai/                AI Router 与 Provider 适配
    import/            本地文档导入
    workbench/         工作台主界面
  lib/                 通用工具
docs/                  项目文档
scripts/               启动脚本
```

## 当前版本

当前主分支版本：`v1.1`

这一版重点完善写作主界面、AI 创作对话、选中文本建议卡片、场景片段标注、可拖拽布局和公开仓库说明。

## 许可证

MIT License。详见 [LICENSE](LICENSE)。
