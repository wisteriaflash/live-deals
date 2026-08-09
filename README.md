# meituan-live-deals

上海美团直播快餐优惠提醒。**本机 Node.js + TypeScript 常驻服务**（v1），通过 WxPusher 推送到个人微信。不是网站，也不是安卓 App。

当前行为规格见 [`openspec/specs/`](openspec/specs/)。v1 变更归档：[`openspec/changes/archive/2026-08-09-add-shanghai-fastfood-alerts/`](openspec/changes/archive/2026-08-09-add-shanghai-fastfood-alerts/)。下一变更：[`openspec/changes/add-live-browser-promo-polling/`](openspec/changes/add-live-browser-promo-polling/)。

## 环境准备

- **Node.js 20+**（项目根目录有 `.nvmrc`，可用 `nvm use`）
- 注册 [WxPusher](https://wxpusher.zjiecode.com/)，获取 `appToken` 与关注者 `uid`
- 直播巡检需要本机已安装 **Google Chrome**（Playwright `channel: chrome`）。也可把 `browserChannel` 设为 `chromium` 并执行 `npx playwright install chromium`。

```bash
npm install
cp .env.example .env   # 填入 WXPUSHER_APP_TOKEN、WXPUSHER_UID
```

`.env` 字段：

| 变量 | 说明 |
|------|------|
| `WXPUSHER_APP_TOKEN` | WxPusher 应用 token |
| `WXPUSHER_UID` | 你的 WxPusher 用户 uid |
| `DATABASE_PATH` | SQLite 路径，默认 `./data/deals.db` |

## 配置

编辑 [`config/default.yaml`](config/default.yaml)：

| 字段 | 说明 |
|------|------|
| `city` | 城市（固定「上海」） |
| `brands` | 品牌白名单（麦当劳、肯德基等） |
| `pollIntervalMinutes` | 巡检间隔（分钟） |
| `dedupeWindowHours` | 去重窗口（小时） |
| `failureAlertThreshold` | 连续失败几次后发维护提醒 |
| `sources` | 数据源列表：`id`、`url`、`brandHint`、`enabled` |
| `minDiscountYuan` | 绝对降价门槛（元），默认 3 |
| `minDiscountRatio` | 相对降幅门槛，默认 0.10（10%） |
| `baselineWindowDays` | 无原价时用历史现价中位数窗口（天），默认 14 |
| `browserChannel` | Playwright 浏览器通道，默认 `chrome` |

添加真实源：在 `sources` 中新增条目并设 `enabled: true`。示例源默认 `enabled: false`。

## 运行

```bash
npm start      # 生产模式（会自动加载项目根目录 .env）
npm run dev    # 开发模式（文件变更自动重启）
```

启动前请在项目根目录配置 `.env`（`cp .env.example .env`）。Node 不会默认读取 `.env`，本项目会在启动时加载。

启动后：

- 本地 HTTP 收件箱：`http://127.0.0.1:8787`
- 定时巡检 `sources` 中已启用的公开 URL

### 收件箱 API

```bash
# 健康检查
curl http://127.0.0.1:8787/health

# 人工投喂链接/文本
curl -X POST http://127.0.0.1:8787/inbox \
  -H 'content-type: application/json' \
  -d '{"text":"麦当劳 测试券","url":"https://example.com/x"}'
```

可选字段 `force: true` 跳过去重窗口。

## 手动验收清单

部署后按顺序自测（不自动化）：

1. 填好 `.env`，执行 `npm start`，确认进程正常、日志无报错
2. 用上方 `curl` 向 `/inbox` 投递测试数据 → **个人微信应收到 WxPusher 消息**
3. 在 `config/default.yaml` 启用一个**真实公开源**（或临时用本地 fixture URL），等待一轮巡检 → 收到优惠推送或确认解析日志
4. 故意写坏某源 URL（如 `https://example.invalid/broken`），设 `enabled: true`，连续失败达到 `failureAlertThreshold` 次 → **收到源失效维护提醒**
5. 启用真实直播源（已有 `mcd-welfare-live`），确认本机 Chrome 可用后 `npm start`，等待一轮巡检 → 若话术含「原价」且降幅达标，微信应出现「比平时低」
6. 同一商品短时间重复巡检 → 去重窗口内不应重复推送
7. `curl` inbox 仍可投喂并收到旧格式/通用推送

单元测试：`npm test`

## 直播巡检（Playwright）

- 含 `liveid=` / `business-live-broadcast` 的源会用本机 Chrome 打开页面，拦截 `livestudiobaseinfo` 类 JSON，从标题/副标题解析优惠话术。
- **没有面向个人可购买的美团直播优惠开放 API**；拦截的是页面私有 H5 能力，随时可能变更。
- DOM 商品卡为空属预期；话术解析不到价格时只记原始快照，不伪造优惠推送。
- 需本机 Google Chrome；或 `browserChannel: chromium` + `npx playwright install chromium`。
- inbox（`POST /inbox`）仍是兜底，行为与 v1 相同。

### 折扣门槛（可配置）

| 字段 | 默认 | 含义 |
|------|------|------|
| `minDiscountYuan` | 3 | 绝对降价（元） |
| `minDiscountRatio` | 0.10 | 相对降幅 |
| `baselineWindowDays` | 14 | 无原价时用历史现价中位数窗口 |
| `browserChannel` | chrome | Playwright 浏览器通道 |

## 合规与限制

- **仅抓取公开可访问信息**，不绕过登录、验证码或平台风控
- 页面结构可能随时变化，解析器需随公开页微调；源失效时会推送维护提醒
- v1 **只推送到本人微信**（WxPusher），**不自动群发**

## 转发到微信群

收到个人微信推送后，**手动复制**优惠内容转发到目标微信群。v1 不做群机器人或自动转发。

## 后续：安卓 App（非 v1）

未来可用 Expo/React Native 做移动端 UI（查看历史、手动投喂等），但**定时巡检仍在本机 Node 服务**运行，不在手机上常驻轮询。
