# Cloudflare / Resend / SendGrid 配置指南

适用版本：GeneSend v0.1，2026-10-28。凭据按产品 owner 的要求留待后续添加。默认打开网站只展示独立示例；点击 **Open workspace** 并使用部署时生成的 owner access key 才能访问私人配置。

## 通道选择

| 场景                   | Cloudflare                             | Resend                        | SendGrid                        |
| ---------------------- | -------------------------------------- | ----------------------------- | ------------------------------- |
| 事务通知、收据、验证码 | 支持                                   | 支持                          | 支持                            |
| 营销活动、newsletter   | 不支持                                 | 支持                          | 支持                            |
| 凭据放置位置           | `send_email` Worker binding            | Settings → Resend credentials | Settings → SendGrid credentials |
| 发送域名               | Cloudflare onboard + `SENDING_DOMAINS` | 服务商 verified domain        | 服务商 authenticated domain     |
| 投递回执               | binding 明确返回的结果                 | 签名 webhook                  | 签名 Event Webhook              |

Settings 顶部可以分别设置 **Default transactional channel** 和 **Marketing channel**。修改默认值不改变已创建的邮件或已经启动的活动。API 也可以显式传入 `provider: cloudflare | resend | sendgrid`。Marketing kind 永远不能使用 Cloudflare 原生通道。

## 1. Cloudflare Email Service

1. 使用包含目标域名的 Cloudflare 账户。在 Email Service → Email Sending 中 onboard 该域名。
2. 按 Cloudflare 页面配置认证和 bounce DNS 记录。不要为安装本产品删除已有 MX 或路由。
3. `wrangler.jsonc` 配置 `send_email: [{ "name": "EMAIL" }]`。
4. `vars.SENDING_DOMAINS` 填写允许的已 onboard 域名，多个域名用逗号分隔。`SEND_ENABLED` 为字符串 `"true"`。
5. 部署后进入 Domains，添加域名并查看 DNS。GeneSend 的 TXT ownership challenge 不能替代 Cloudflare Email Service onboard。
6. 任意收件人发送需要符合 Cloudflare Email Sending 的账户/付费资格；只给账户内 verified destinations 的规则另行适用。以 Cloudflare 的实际响应为准。

Cloudflare 通道支持 Worker binding 和专用 API Token 两种模式。不配置 token 时使用 binding；配置 `CLOUDFLARE_EMAIL_API_TOKEN` 后，自动使用 Cloudflare Email REST API。无论哪种模式都不需要 Cloudflare Global API Key，也不使用本机 Wrangler / CF CLI 的 OAuth token 作为线上运行凭据。

### 使用 Cloudflare CLI 创建专用 token

`cf` 与 Wrangler 使用独立登录。`cf auth whoami` 应显示已登录，授权范围含 `account_api_tokens:create` 和 Email Sending 权限。创建 token 使用 CF CLI；部署仍可使用 Wrangler。

```bash
umask 077
mkdir -p secrets
export CLOUDFLARE_ACCOUNT_ID="your_account_id"
cf accounts tokens permission-groups list
cf accounts tokens create \
  --name "GeneSend production email sending" \
  --policies @secrets/cloudflare-email-policy.json \
  > secrets/cloudflare-email-token.json
chmod 600 secrets/cloudflare-email-token.json
```

policy 文件应只包含目标账户的 Email Sending Write 权限（控制台中称 Email Sending: Edit）；permission group ID 从 CLI 的列表查询，`resources` 限定到 `com.cloudflare.api.account.<ACCOUNT_ID>`，不要授予 Workers、DNS、D1 等无关权限。创建响应中的 `value` 是仅显示一次的 token，需要直接保存到私有文件，不要打印到日志、提交到 Git 或发送到前端。

用 token 响应中的 value 作为标准输入传给 `wrangler secret put CLOUDFLARE_EMAIL_API_TOKEN`，然后在 `wrangler.jsonc` 的 vars 中设置 `CLOUDFLARE_EMAIL_ACCOUNT_ID`，部署应用。API token 配置在 Worker Secret 中，不写在 vars。读取设置接口只返回是否配置及 transport，不返回凭据。

删除该 secret 并部署后可恢复 Worker binding；不要用值为空的新 token 覆盖已有有效 token。token 可在 Cloudflare 的 Account API Tokens 页面按名称/ID 撤销。

参考安装在 2026-10-28 创建了账户专用的 `GeneSend production email sending` token，并切换为 REST 模式。已核验 token active、邮件抑制列表 API 可访问。token policy 仅授予目标账户的 Email Sending Write，不包含 Workers、DNS 或 D1 权限；没有为配置验证发送真实邮件。

常见错误：`E_SENDER_NOT_VERIFIED` / `E_SENDER_DOMAIN_NOT_AVAILABLE` 代表发送域未就绪；`E_RECIPIENT_NOT_ALLOWED` 代表账户或 binding 的收件人限制；`E_RATE_LIMIT_EXCEEDED` / `E_DAILY_LIMIT_EXCEEDED` 代表发送限额。明确的临时限流会退避重试，未知结果标记 uncertain。

官方资料：[概览](https://developers.cloudflare.com/email-service/)、[域名配置](https://developers.cloudflare.com/email-service/configuration/domains/)、[Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)、[营销限制](https://developers.cloudflare.com/email-service/reference/faq/)。

## 2. Resend

### 域名与 API key

1. 在 Resend 添加并验证发送域名，按其控制台给出的实际值发布 DNS；不要照抄其他人的 DKIM 值。
2. 创建可发送邮件且能读取 Domains 的 API key。仅具有某个域发送权限的 key 可能无法完成域名列表核验。
3. GeneSend → Settings → Resend credentials 填写 API key，点击 **Save provider settings**。留空表示保留已有 key。
4. 点击 Resend 区域的 **Verify domains**。GeneSend 从 Resend API 查询已 verified 的域，不信任浏览器传入的域名白名单。
5. 填写组织名称和邮寄地址。若需要营销，选择 Resend 为 Marketing channel 并保存。

### 投递回调

在 Resend 创建 webhook：

```text
https://send.genedai.me/webhooks/resend
```

自托管到别的域时替换 origin。建议订阅 `email.sent`、`email.delivered`、`email.bounced`、`email.complained`、`email.failed`、`email.suppressed`。将该 endpoint 的 `whsec_...` signing secret 保存至 GeneSend 的 **Webhook signing secret**。

GeneSend 使用原始请求体验证 Svix 签名和时间戳，按 webhook ID 去重。Webhook 在发送记录尚未持久化时到达会返回可重试错误，避免默默丢失确认。只在合法回调确认后更新 delivered。永久 bounce 与 complaint 会进入抑制表。

Resend 请求包含稳定的 Idempotency-Key。服务商的幂等保留期是服务商行为，不能当作无限期保障；GeneSend 仍保存自己的请求幂等记录。未知发送结果不会自动重发。

官方资料：[发送 API](https://resend.com/docs/api-reference/emails/send-email)、[域名读取](https://resend.com/docs/api-reference/domains/get-domain)、[webhook 验证](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests)、[幂等](https://resend.com/docs/dashboard/emails/idempotency-keys)。

## 3. SendGrid

### 域名与 API key

1. 在 SendGrid 的 Sender Authentication 中认证域名，按其提供的实际记录配置 DNS。
2. 创建受限 API key：**Mail Send** 发送权限和 **Domain Authentication** 读取权限。不要为了方便把无关账户权限授予应用。
3. GeneSend → Settings → SendGrid credentials 保存 `SG....` key。
4. 点击 **Verify domains**。GeneSend 查询 `/v3/whitelabel/domains`，只接收 valid 的域名。
5. 选择 SendGrid 作为事务或营销默认通道。首次营销前填写组织名称与邮寄地址。

当前适配器使用全球 endpoint `https://api.sendgrid.com/v3`。**不支持 EU regional subuser endpoint**。域名核验当前读取前 200 个域；拥有更多域时需先扩展分页。

### Signed Event Webhook

在 SendGrid 的 Mail Settings 中启用 Event Webhook，endpoint：

```text
https://send.genedai.me/webhooks/sendgrid
```

启用 **Signature Verification**，把控制台给出的 verification public key 保存到 GeneSend 的 **Event Webhook verification key**。它不是 API key，也不是私钥。

选择 delivered、bounce、dropped、spamreport、unsubscribe/group_unsubscribe 等投递事件。GeneSend 使用官方 `@sendgrid/eventwebhook` 库验证 ECDSA 签名，检查请求时间戳，然后依据 `genesend_id` correlation ID 及收件地址关联邮件。事件按 `sg_event_id` 去重。没有启用签名或缺少公钥时不会接受未经验证的状态更新。

GeneSend 对每封邮件发送独立请求，不把整份联系人列表上传到 SendGrid。SendGrid 自己的 open/click/subscription tracking 被关闭；GeneSend 在活动级提供可选 tracking 和自己的退订机制。已有服务商抑制规则仍可能阻止发送，不能绕过。

SendGrid Mail Send 返回 202 代表接受请求。GeneSend 保存 `X-Message-Id` 并等待投递事件。这里**不假定 SendGrid 支持请求级幂等**；网络模糊结果会标记 uncertain，避免自动重复投递。

官方资料：[Mail Send](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send)、[域名列表](https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/list-all-authenticated-domains)、[签名 webhook](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features)、[List-Unsubscribe](https://www.twilio.com/docs/sendgrid/ui/sending-email/list-unsubscribe)。

## 4. 第一场营销活动

1. 在 Audience 添加联系人或导入 CSV。示例：

```csv
email,name,tags,opt_in
friend@example.com,Alex,Newsletter;Customers,true
```

`opt_in=true` 仅用于已明确订阅的人。缺省是 pending。导入不会把现有退订或 suppressed 联系人改回 subscribed。

2. 创建 Campaign，填写 sender、subject、HTML 和可选 audience tag。默认发送速率 60 封/分钟，允许 1–100。仅选择匹配 tag 且 subscribed、未 suppressed 的联系人。
3. 如需 engagement 指标，显式开启 Open tracking / Click tracking。默认关闭。
4. 保存，再点击 **Review & send**。检查通道、地址、组织、邮寄地址及 eligible subscriber 数量，确认后立即开始或排期。
5. 受众在开始发送时保存快照。即使之后退订或被抑制，也会在实际发送前再次检查并跳过。
6. Pause / Cancel 停止未来任务；不能撤回已经进入服务商的请求。

每封营销邮件都附加组织/地址 footer、签名退订链接和 one-click unsubscribe headers。GET 展示确认页，POST 应用退订。收件人退订不等于抑制所有事务邮件；投诉和永久 bounce 的 suppression 才阻止所有类型。

## 5. 凭据与运维

- ESP API keys/signing values 在服务器使用 AES-GCM 加密存 D1，不会由读取设置接口返回。
- 加密和长期签名依赖 Worker secret `SESSION_SECRET`。安全备份它；不要随意覆盖。轮换需要迁移已有密文及处理旧退订链接。
- Owner access key 的 SHA-256 hash 在 `ADMIN_KEY_HASH`。本机生成的明文仅保存在 Git 忽略的 `secrets/workspace-access.md`。
- 备份 D1 与 R2；v0.1 没有自动清除旧邮件内容的 retention job。
- 观察 email activity 的 failed/uncertain、Queue dead letters、服务商日志及 webhook 失败。
- API key 权限、账户限额、发送域信誉和 inbox placement 是独立验收事项。测试通过、HTTP 202 或 deployed 均不是收件箱效果证明。
