# JMCOMIC-redirect-worker

基于 Cloudflare Workers、Cron Triggers 与 Workers KV 的入口重定向服务。

Worker 定时读取公开发布页，提取大陆入口并保存到 KV；检测到主入口变化时，需要连续观察到相同结果后才会切换。上游抓取或解析失败时继续使用最后一次确认的地址。

## 主要行为

- 默认每 30 分钟检查一次发布页。
- 仅解析发布页中的大陆入口区段。
- 地址变化默认需要连续确认两次。
- 返回不可缓存的 HTTP 302。
- `/__status` 提供当前状态与最近错误摘要。
- 限制上游响应大小，并校验目标协议、主机名和关键词。

## 项目结构

```text
src/                 Worker、解析、状态与重定向逻辑
test/                Node.js 单元测试
scripts/             上游页面检查脚本
wrangler.jsonc       Worker、KV、Cron 与运行参数
.github/workflows/   GitHub Actions 检查
```

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/morenb3396/JMCOMIC-redirect-worker)

## 部署位置

- Git 仓库接入：Cloudflare Dashboard → **Workers & Pages** → **Import a repository**
- Worker 配置：项目根目录的 `wrangler.jsonc`
- 自定义域名：Worker → **Settings** → **Domains & Routes**
- 构建与部署记录：Worker → **Deployments**
- 运行日志：Worker → **Observability** → **Logs**

仓库不包含固定 Custom Domain、Cloudflare 账号信息或资源 ID。`STATE` KV binding 未指定 ID，支持资源自动配置；若所用部署流程不支持自动配置，需要自行创建并绑定 KV。

熟悉 Wrangler 的用户也可以从项目根目录部署：

```powershell
npm ci
npx wrangler login
npm run check
npm run deploy
```

## 配置

运行参数位于 `wrangler.jsonc`：

| 参数 | 用途 |
| --- | --- |
| `SOURCE_URL` | 发布页地址 |
| `BOOTSTRAP_TARGET` | KV 未初始化时的备用地址 |
| `CONFIRMATION_COUNT` | 地址切换前的连续确认次数，范围 1–5 |
| `TARGET_HOST_KEYWORDS` | 允许出现在目标主机名中的关键词 |
| `PRESERVE_PATH` | 是否保留入口请求的路径和查询参数 |
| `MAX_SOURCE_BYTES` | 发布页最大读取字节数 |

检查频率位于 `triggers.crons`，Cron 时间使用 UTC。

## 检查

```powershell
npm test
npm run check
npm run check:source
```

部署后可通过 `https://<worker-host>/__status` 查看当前入口、候选入口、检查时间和失败状态。该接口默认公开，不应让错误信息包含私密数据。

## 安全边界

- Worker 不需要在源码中保存 Cloudflare API Token。
- `.env*`、`.dev.vars*`、`.wrangler/` 与依赖目录不会进入 Git。
- 新增密钥时应使用 Workers Secrets，而不是 `vars` 或源码。
- 项目根据发布页内容更新地址，不负责验证各地区或运营商的实际可达性。

## 免责声明

本项目是非官方开源工具，与发布页或目标网站的运营方无关联。使用者应遵守所在地法律法规、Cloudflare 服务条款和目标网站规则，并自行承担部署及使用责任。

## License

[MIT](./LICENSE)
