# 墨枝快速开始

这份说明面向第一次下载墨枝的用户。

## 1. 准备环境

需要先安装：

- Node.js
- pnpm

检查方式：

```bash
node -v
pnpm -v
```

如果没有安装 pnpm：

```bash
npm install -g pnpm
```

## 2. 下载项目

```bash
git clone https://github.com/52402826-wq/yimu-novel-workbench.git
cd yimu-novel-workbench
```

## 3. 安装依赖

```bash
pnpm install
```

## 4. 设置数据目录

墨枝会把小说数据保存在本机目录里。可以使用默认目录，也可以自定义。

复制配置示例：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
NOVEL_WORKBENCH_DATA_DIR=/Users/yourname/Documents/NovelWorkbenchData
PORT=3007
```

不要把 `.env.local` 上传到 GitHub。

## 5. 启动工作台

```bash
pnpm workbench:start
```

打开：

```text
http://localhost:3007
```

macOS 用户也可以双击项目里的：

```text
start-workbench.command
```

## 6. 第一次使用

建议按这个顺序：

1. 新建一本小说
2. 新建卷
3. 新建章节
4. 在正文区写作
5. 到 AI 页面添加 Provider
6. 回到正文页使用创作对话或选中文本建议

## 7. AI Provider

AI Provider 需要你自己准备对应模型服务商的 API Key。

支持类型：

- OpenAI
- DeepSeek
- Kimi
- Claude
- Gemini
- OpenAI Compatible

API Key 保存在本机数据库里，不会提交到仓库。

## 8. 常见问题

### 页面打不开

重新运行：

```bash
pnpm workbench:start
```

如果端口被占用，可以修改 `.env.local` 里的 `PORT`。

### 保存失败

通常是数据目录权限问题。请确认 `NOVEL_WORKBENCH_DATA_DIR` 指向的目录存在，并且当前终端有写入权限。

### 不想上传私人资料

仓库已经忽略数据库、数据目录和环境变量文件。提交前仍建议检查：

```bash
git status --short
```

确认没有 `.env`、数据库、小说正文资料被列出来。
