# JM 大陆入口自动重定向 Worker

一个运行在 Cloudflare Workers 上的小型重定向服务。它定时读取公开发布页，提取其中的大陆入口，在确认地址变化后更新重定向目标。

项目不需要服务器，也不需要把 Cloudflare API Token、账号 ID 或 KV ID 写进仓库。每位部署者都会使用自己 Cloudflare 账号下的 Worker 和 KV。

## 功能

- 每 30 分钟检查一次发布页。
- 只解析“内地网域”至“APP 软件下载”之间的地址。
- 新地址连续出现两次后才替换旧地址，降低页面临时异常导致误切换的概率。
- 抓取失败时继续使用最后一次确认成功的地址。
- 使用不缓存的 HTTP 302，避免浏览器长期记住旧入口。
- 提供 `/__status` 状态接口，便于检查最近一次运行结果。
- 限制发布页响应大小，并只允许符合关键词规则的 HTTPS 目标。

## 一键部署

> 仓库发布后，请先把下面链接里的 `YOUR_GITHUB_USERNAME` 改成你的 GitHub 用户名。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_GITHUB_USERNAME/jm-mainland-redirect-worker)

部署步骤：

1. 点击上方 **Deploy to Cloudflare**。
2. 登录自己的 GitHub 和 Cloudflare 账号。
3. 按页面提示选择仓库名称、Worker 名称和资源名称。
4. 确认并开始部署。Cloudflare 会自动创建并绑定 `STATE` KV。
5. 部署成功后，打开 Cloudflare 给出的 `*.workers.dev` 地址。
6. 在地址末尾加上 `/__status` 检查状态，例如：

   ```text
   https://你的-worker.你的子域.workers.dev/__status
   ```

默认的引导地址是 `https://18comic.vip/`。当 KV 中还没有状态时，第一次成功的定时检查会直接采用发布页当前列出的主入口；之后再发生变化时，才会执行连续确认规则。

Cloudflare 的一键部署只支持公开的 GitHub 或 GitLab 仓库。相关资源会根据 `wrangler.jsonc` 自动配置。

## 通过 Cloudflare 网页导入

不使用一键按钮也可以从控制台部署：

1. 先把本项目上传到自己的 GitHub 仓库。
2. 打开 Cloudflare 控制台，进入 **Workers & Pages**。
3. 选择 **Create application**。
4. 在 **Import a repository** 旁选择 **Get started**。
5. 连接 GitHub，选择本仓库。
6. 确认 Worker 名称与 `wrangler.jsonc` 中的 `name` 一致。
7. 保存并部署。

连接 Git 仓库后，后续向生产分支推送代码会触发 Cloudflare Builds 自动构建和部署。

## 绑定自己的域名（可选）

默认的 `workers.dev` 地址已经可以使用。如果想换成自己的域名：

1. 确保域名已经接入同一个 Cloudflare 账号。
2. 进入 **Workers & Pages** → 选择 Worker。
3. 打开 **Settings** → **Domains & Routes**。
4. 选择 **Add** → **Custom Domain**。
5. 输入自己的子域名，例如 `go.example.com`。

公开仓库没有写死任何 Custom Domain，以免部署者因不拥有别人的域名而部署失败。Cloudflare 会为 Custom Domain 创建所需 DNS 记录并签发证书；不要预先建立同名 CNAME。

## 命令行部署

需要：

- Node.js 20 或更高版本
- 一个 Cloudflare 账号

```powershell
git clone https://github.com/YOUR_GITHUB_USERNAME/jm-mainland-redirect-worker.git
cd jm-mainland-redirect-worker
npm ci
npx wrangler login
npm run check
npm run deploy
```

首次部署时，Wrangler 会为没有填写资源 ID 的 `STATE` binding 自动创建或选择 KV。登录凭据保存在部署者自己的环境中，不需要提交到 GitHub。

## 验证部署

访问 Worker 根地址，应该收到 HTTP 302：

```powershell
curl.exe -I https://你的-worker.你的子域.workers.dev/
```

响应应包含类似内容：

```text
HTTP/1.1 302 Found
Location: https://当前入口.example/
Cache-Control: no-store, max-age=0
```

再访问状态接口：

```powershell
curl.exe https://你的-worker.你的子域.workers.dev/__status
```

其中比较重要的字段：

| 字段 | 含义 |
| --- | --- |
| `currentTarget` | 当前用于跳转的已确认地址 |
| `candidates` | 最近一次从发布页提取到的地址列表 |
| `pendingTarget` | 正在等待连续确认的新地址 |
| `pendingCount` | 新地址已经连续出现的次数 |
| `lastSuccessfulCheckAt` | 最近一次成功检查时间 |
| `consecutiveFailures` | 连续失败次数 |
| `lastError` | 最近一次错误摘要 |

`/__status` 是公开接口，不要在配置或错误消息中放入私密信息。

## 修改参数

参数位于 [`wrangler.jsonc`](./wrangler.jsonc) 的 `vars` 中：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `SOURCE_URL` | `https://jmcomictt.site/` | 要检查的公开发布页 |
| `BOOTSTRAP_TARGET` | `https://18comic.vip/` | 第一次成功检查前使用的备用地址 |
| `CONFIRMATION_COUNT` | `2` | 切换已有入口前的连续确认次数，限制为 1–5 |
| `TARGET_HOST_KEYWORDS` | `comic,jm` | 目标主机名必须包含的关键词，使用英文逗号分隔 |
| `PRESERVE_PATH` | `false` | 为 `true` 时保留访客请求的路径和查询参数 |
| `MAX_SOURCE_BYTES` | `524288` | 单次最多读取的发布页字节数 |

定时频率位于：

```jsonc
"triggers": {
  "crons": ["*/30 * * * *"]
}
```

Cron 使用 UTC 时间。修改 `wrangler.jsonc` 后需要重新部署才会生效。

## 本地开发与测试

```powershell
npm ci
npm test
npm run check
npm run dev
```

`npm run dev` 会启用 Wrangler 的计划任务测试入口：

```text
http://localhost:8787/__scheduled
```

随后可以查看：

```text
http://localhost:8787/__status
```

检查真实发布页能否被当前电脑解析：

```powershell
npm run check:source
```

也可以临时指定其他发布页，不需要修改文件：

```powershell
$env:SOURCE_URL = "https://example.com/release-page"
npm run check:source
Remove-Item Env:SOURCE_URL
```

## 工作原理

```text
Cloudflare Cron
      │
      ▼
抓取 SOURCE_URL ──失败──▶ 保存错误状态，继续使用旧入口
      │成功
      ▼
提取并校验大陆入口
      │
      ▼
连续确认变化 ─────────▶ 写入 Workers KV
                              │
访客请求 Worker ──────────────┘
      │
      ▼
返回 302 到 currentTarget
```

KV 只存放当前入口、候选入口、时间和错误摘要，不需要 Cloudflare API Token。Worker 通过 binding 直接访问 KV，不会在运行时调用 Cloudflare 管理 API。

## 安全与隐私

- 仓库不应包含 API Token、账号 ID、Zone ID、KV Namespace ID、Cookie 或个人域名。
- `.dev.vars*`、`.env*`、`.wrangler/` 和 `node_modules/` 已加入 `.gitignore`。
- 如果以后新增密钥，请使用 `npx wrangler secret put 密钥名`，不要写入源码或 `wrangler.jsonc`。
- 发布前可以运行下面的基础检查：

  ```powershell
  git status --short
  git grep -n -i -E "api[_-]?token|authorization|bearer|password|private[_-]?key"
  ```

## 限制

- 本项目只根据发布页内容更新地址，不会主动绕过网络限制。
- Cloudflare 能抓取到目标，不代表目标在所有地区、运营商或设备上都可访问。
- 发布页结构发生变化时，解析可能失败；失败时会保留最后一次确认的入口。
- `workers.dev` 和自定义域名在不同网络中的可达性需要部署者自行实测。

## 免责声明

本项目是非官方开源工具，与发布页或目标网站的运营方无关联。请遵守所在地法律法规、Cloudflare 服务条款以及目标网站规则。部署者应自行承担使用、内容访问和域名运营责任。

## License

[MIT](./LICENSE)
