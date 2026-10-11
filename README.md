# 墨桥 · Notion → 微信公众号

本机运行的文章转换工具，以**直接同步到公众号草稿箱**为主：读取 Notion 页面，生成内联排版，将正文图片与 LaTeX 公式转存到微信，再创建草稿。

## 启动

需要 Node.js 22.12 或以上；网页登录同步还需要本机安装 Google Chrome（使用独立登录目录）。macOS 可双击根目录的 `启动墨桥.command`；也可在终端执行：

```sh
git clone https://github.com/hkcao/Notion2Wechat.git
cd Notion2Wechat
npm ci --cache /private/tmp/inkbridge-npm-cache
npm run build
npm start
```

打开 [本地工作台](http://localhost:3210)。开发模式执行 `npm run dev`，前后端使用同一个端口。服务仅监听 `127.0.0.1`，不适用于直接部署公网。终端中按 Ctrl+C 停止。

## 第一次使用

1. 点击「连接设置」，填写 Notion Integration Token。在 [Notion 开发者入口](https://app.notion.com/developers)打开对应的内部连接，从 Configuration 复制 API token，并启用读取内容权限。在 Content access → Edit access 中选择目标页面，或从目标页面的「连接」菜单添加它。若连接名称已显示但导入仍返回 404，核对该连接的 Content access 列表，并确认工具中 Token 来自同一连接的 Configuration；名称相同不足以确认身份相同。公开页面也需要授权读取。[官方连接授权说明](https://developers.notion.com/guides/get-started/internal-connections)
2. 在连接设置保留默认的「网页登录同步」，点击「打开公众号登录窗口」。在专用 Chrome 窗口用当前公众号的管理员微信扫码并确认，墨桥会显示账号名称。刷新工具仍可使用；重启服务后再次点击此按钮恢复本机登录，过期才需重新扫码。此模式通过公众号网页保存草稿，不要求 AppID / AppSecret 或 API IP 白名单。
3. 粘贴 Notion 页面链接，点击「导入页面」。检查图片、公式和「转换检查」，调整主题、字体、字号和行距。
4. 点击「同步到草稿箱」，填写可选作者、摘要和阅读原文链接，选择封面，再点击同步。网页保存成功会返回草稿 ID，点击「在公众号窗口查看草稿」检查完整内容、图片、公式与排版。工具只保存草稿，发表由用户在公众号后台操作。

若选择「官方 API 同步」，仍需在[微信开发者平台](https://developers.weixin.qq.com/platform/)的「我的业务与服务 → 公众号／服务号 → 基础信息」配置 AppID、AppSecret、API IP 白名单和接口权限。重置 AppSecret 会使已接入系统的旧密钥失效。若官方封面或草稿接口返回 48001（无接口权限），可使用网页登录路径。

扫码会话保存在 `data/wechat-browser/` 的独立 Chrome 配置中；额外保存 `inkbridge-cookies.json` 以恢复 Chrome 退出时通常会清除的会话 Cookie，文件权限 600，目录权限 700。登录不会写入日常 Chrome 配置。此目录和 `data/connections.json` 均禁止通过工具下载，已排除 Git 跟踪，不要分享。程序退出前保存登录状态；服务重启后由用户点击登录按钮恢复窗口，启动和查询状态不会自动打开浏览器。

在「连接设置」点击「保存连接」后，Notion Token、AppID、AppSecret 会保存在项目目录的 `data/connections.json`，刷新页面或重启服务后自动使用。再次打开设置显示「已配置」；留空保留已有值，填写新值后保存即可更新。文件为本机明文配置，权限为仅当前系统用户可读写（600），已排除 Git 跟踪，生产和开发服务均不提供配置文件下载；不要分享该文件。若要清除网页保存的配置，停止服务后删除此文件，再启动。也可以在 `.env` 配置 `NOTION_TOKEN`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`，网页保存值优先，未保存字段使用 `.env`；不要提交或分享 `.env`。接口由本地服务调用，密钥不会返回到页面，不使用浏览器存储。没有凭据时可以试用示例文章和 Markdown。

## 支持的内容

| 内容 | 转换方式 |
| --- | --- |
| 标题、段落、粗体、斜体、下划线、删除线、文字颜色 | 保留结构、标注与 Notion 颜色，使用公众号适用的内联样式 |
| 有序／无序嵌套列表、待办、引用、提示块 | 对应 HTML 排版 |
| 图片和图片说明 | 导入时下载并内嵌 PNG，按文件头识别 Notion 的通用二进制响应；同步时上传到微信正文图床 |
| 行内和块级 LaTeX 公式 | MathJax 渲染成 3 倍分辨率 PNG，随正文上传 |
| 超链接 | 预览／导出保留 href；文末出处默认关闭，可手动开启。网页登录同步保留微信链接，外部链接转为文字，网址保留在原位置，结果中提示转换数量 |
| 表格、代码块、分割线 | 保留内容，添加内联样式 |
| 多列、折叠块 | 按列顺序展平／展开，并提示变化 |
| 视频、音频、PDF、书签、嵌入 | 转为链接并提示；不直接上传视频／音频 |
| 同步块 | 递归读取原始块；检测循环 |
| 未支持的块、子数据库、目录等 | 给出转换提示，需对照原文检查 |

也支持粘贴 Markdown 或导入 `.md` / `.txt`，公式使用 `$…$` 或独占段落的 `$$…$$`。Markdown 图片需使用公开可访问的 HTTPS 地址或内嵌 PNG/JPEG/WebP/GIF；当前不支持 Markdown 文件旁边的相对路径图片或 Notion ZIP。图片 GIF 转为第一帧 PNG。

## 排版与账号边界

- 保留内容结构与标注，统一调整排版；Notion 的页面字体、列宽等页面级视觉元数据不等于 API 内容，公众号也会清理 HTML，无法保证像素级一致。实际效果请在公众号后台预览。
- 网页同步需要有效的公众号后台登录，使用网页内部接口，微信调整后台后可能需要更新。真实 Notion 读取、网页草稿保存与回读已验证；具体内容和账号数据保留在本机，不随源码上传。
- 默认不把文章标题再插入正文，也不自动追加文末链接。如需这两项，可在排版选项中开启；原文开头与文章标题相同的标题会避免重复。
- 网页封面优先使用上传封面，否则使用正文第一张普通图片；只有公式或无图片的文章应上传独立封面。官方 API 模式可优先使用永久封面素材 ID，网页模式隐藏该字段。
- 同步会上传正文图片、公式和封面素材，再创建草稿。失败不会自动删除已上传素材；若最后请求超时，先检查草稿箱再重试，以免重复创建。
- 复制排版会写入 HTML 富文本和纯文本剪贴板。微信编辑器对内嵌图片的粘贴可能不同，请检查图片；直接草稿同步的图片会替换为微信图床地址。
- Notion 最多读取 3000 个块、20 层嵌套。外部图片仅允许公开 HTTPS 地址，单张原图最多 10 MB、解码最多 4000 万像素，缩至宽度不超过 1600 px。整次请求最多 30 MB。
- 标题限制 64 字、作者 8 字、摘要 120 字；工具不再按 2 万 HTML 字符在本地拒绝长文。网页模式向 operate_appmsg 保存完整 HTML，API 模式向 draft/add 提交完整 HTML，服务端的内容限制仍以实际响应为准。保留本工具的 1 MB 正文大小上限（图片／公式的 Base64 在计数前替换为图片链接），不会自动截断或拆分文章。

## 验证和结构

```sh
npm test
npm run build
npm audit --cache /private/tmp/inkbridge-npm-cache
```

- `server/notion.js`：Notion 分页／递归读取与富文本转换。
- `server/convert.js`：Markdown、公式 PNG、图片内嵌、样式和 HTML 清理。
- `server/wechat.js`：stable_token → 正文图片上传 → 永久封面 → draft/add。
- `server/wechat-web.js`、`server/wechat-web-protocol.js`：扫码浏览器会话／本机 Cookie 恢复 → 网页图片上传 → 网页草稿保存／打开编辑器。
- `server/network.js`：公开图片地址验证、DNS 固定、下载限额。
- `server/index.js`：本机 API 和 Vite／生产静态文件服务。
- `server/credentials.js`：本机连接配置持久化、权限限制与环境变量回退。
- `src/main.js`、`src/style.css`：工作台、预览、连接与草稿同步界面。
- `tests/conversion.test.js`：转换、错误处理和草稿接口流程测试，远程接口使用 mock。
- `tests/credentials.test.js`：配置持久化、部分更新、文件权限与状态不泄漏密钥的测试。
- `tests/network.test.js`：通用二进制 MIME 的 Notion 图片识别与文件头校验，拒绝伪装为图片的 HTML／SVG。
- `tests/wechat-web.test.js`：网页会话持久化、权限、长文完整性、图片／公式去重、链接出处、封面表单与失效登录测试（模拟远程接口）。
- `HANDOFF.md`、`data/`、`artifacts/`：仅用于本机交接、配置／登录状态和验证，均不上传 GitHub；仓库只包含源码、合成示例与测试。

## 官方接口参考

- [Notion 内容块](https://developers.notion.com/reference/block)
- [Notion 分页读取子块](https://developers.notion.com/reference/get-block-children)（使用 `Notion-Version: 2026-03-11`）
- [微信新增草稿](https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html)
- [微信素材管理](https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/Adding_Permanent_Assets.html)
- [微信 stable access token](https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/getStableAccessToken.html)

凭据配置路径也参照了 [md2wechat 项目的配置记录](https://github.com/geekjourneyx/md2wechat-skill/blob/main/docs/WECHAT-CREDENTIALS.md)。菜单名称可能随账号类型变化，以实际页面为准。

官方 API 长文处理参考 [md2wechat-free 的草稿实现](https://github.com/jiabao-wang/md2wechat-free/blob/1796b218aa9e11b4fc800d2475c58d655634cc26/src/wechat/draft.ts)：向 draft/add 直接提交完整 HTML。网页登录的请求格式适配自 [wechat-mp-mcp-server](https://github.com/xihe-lab/wechat-mp-mcp-server/tree/6500b55572431ad5b30941ad92debde5d8e325b5/src/webhub)，使用 Apache-2.0 许可，修改和许可记录在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。仅增加本机 playwright-core，不调用第三方托管服务。
