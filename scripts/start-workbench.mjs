import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.NOVEL_WORKBENCH_DATA_DIR ?? "/Users/ray/Documents/NovelWorkbenchData";
const port = Number(process.env.PORT ?? 3007);
const localUrl = `http://localhost:${port}`;
const databasePath = join(dataDir, "novel-workbench.db");
const nextCliPath = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const productName = "墨枝";

async function main() {
  printHeader();
  checkDataDirectory();

  const portStatus = await checkPort(port);
  if (portStatus === "workbench") {
    console.log(`${productName}已经在运行：${localUrl}`);
    openWorkbench();
    return;
  }
  if (portStatus === "occupied") {
    console.error(`端口 ${port} 已被其他程序占用。请关闭占用程序，或换一个 PORT 再启动。`);
    process.exit(1);
  }

  ensureBuild();
  startServer();
}

function printHeader() {
  console.log(`${productName}启动检查`);
  console.log(`程序路径：${projectRoot}`);
  console.log(`数据路径：${dataDir}`);
  console.log(`访问地址：${localUrl}`);
  console.log("");
}

function checkDataDirectory() {
  try {
    mkdirSync(dataDir, { recursive: true });
    const testPath = join(dataDir, ".novel-workbench-write-test");
    writeFileSync(testPath, "ok");
    unlinkSync(testPath);
  } catch (error) {
    console.error("数据目录不可写，工作台已停止启动。");
    console.error(`目录：${dataDir}`);
    console.error("请在 macOS 系统设置里允许当前终端或 Codex 访问 Documents，或重新运行启动脚本。");
    console.error(`原始错误：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (existsSync(databasePath)) {
    try {
      writeFileSync(join(dataDir, ".novel-workbench-db-access-test"), "ok");
      unlinkSync(join(dataDir, ".novel-workbench-db-access-test"));
    } catch (error) {
      console.error("数据库目录可读但不可写，保存、新建和删除会失败。");
      console.error(`数据库：${databasePath}`);
      console.error(`原始错误：${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
}

function ensureBuild() {
  const buildIdPath = join(projectRoot, ".next", "BUILD_ID");
  if (existsSync(buildIdPath)) {
    return;
  }

  console.log("还没有生产构建，正在构建一次...");
  const result = runBuild();

  if (result.status !== 0) {
    console.error("构建失败，工作台未启动。");
    process.exit(result.status ?? 1);
  }
}

function startServer() {
  console.log("启动工作台服务...");
  console.log(`打开：${localUrl}`);
  console.log("写完后回到这个窗口，按 Control + C 停止服务。");
  console.log("");

  openWorkbenchSoon();
  const child = spawnServer();
  let stopping = false;

  const stopChild = (signal = "SIGTERM") => {
    if (stopping) {
      return;
    }
    stopping = true;
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => stopChild("SIGINT"));
  process.on("SIGTERM", () => stopChild("SIGTERM"));
  process.on("SIGHUP", () => stopChild("SIGHUP"));
  process.on("exit", () => stopChild("SIGTERM"));
  child.on("exit", (code) => process.exit(code ?? 0));
}

function runBuild() {
  if (existsSync(nextCliPath)) {
    return spawnSync(process.execPath, [nextCliPath, "build", "--webpack"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: runtimeEnv(),
    });
  }

  const pnpm = findExecutable("pnpm");
  if (pnpm) {
    return spawnSync(pnpm, ["build"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: runtimeEnv(),
    });
  }

  return spawnSync("npm", ["run", "build"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: runtimeEnv(),
  });
}

function spawnServer() {
  if (existsSync(nextCliPath)) {
    return spawn(process.execPath, [nextCliPath, "start"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: runtimeEnv(),
    });
  }

  const pnpm = findExecutable("pnpm");
  if (pnpm) {
    return spawn(pnpm, ["start"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: runtimeEnv(),
    });
  }

  console.error("没有找到 pnpm，也没有找到项目里的 Next 启动文件。请先在项目目录运行 npm install。");
  process.exit(1);
}

function runtimeEnv() {
  return {
    ...process.env,
    PATH: withCommonPaths(process.env.PATH ?? ""),
    PORT: String(port),
    NOVEL_WORKBENCH_DATA_DIR: dataDir,
  };
}

function withCommonPaths(currentPath) {
  return [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    currentPath,
  ]
    .filter(Boolean)
    .join(":");
}

function findExecutable(name) {
  const result = spawnSync("/bin/zsh", ["-lc", `command -v ${name} || true`], {
    encoding: "utf8",
    env: { ...process.env, PATH: withCommonPaths(process.env.PATH ?? "") },
  });
  return result.stdout.trim() || "";
}

function openWorkbenchSoon() {
  setTimeout(openWorkbench, 900);
}

function openWorkbench() {
  spawn("open", [localUrl], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

async function checkPort(targetPort) {
  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", async (error) => {
      if (error.code === "EADDRINUSE") {
        resolve((await looksLikeWorkbench()) ? "workbench" : "occupied");
        return;
      }
      if (error.code === "EPERM") {
        console.error(`没有权限监听端口 ${targetPort}。请重新打开终端，或换一个端口。`);
        process.exit(1);
      }
      console.error(`端口检查失败：${error.message}`);
      process.exit(1);
    });

    server.once("listening", () => {
      server.close(() => resolve("free"));
    });

    server.listen(targetPort);
  });
}

async function looksLikeWorkbench() {
  try {
    const response = await fetch(`${localUrl}/api/workbench`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
