# AI 中转（Cloudflare Worker）

让玩家打开游戏就能和家电对话，不用自己填 Key。Groq Key 只存在 Cloudflare 后台的加密变量里，网页和仓库里都没有。

```
游戏（GitHub Pages）→ 这个 Worker → Groq
```

## 部署（网页控制台，约 5 分钟，免费）

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) 注册或登录。
2. 左侧 **Workers 和 Pages**（Compute → Workers & Pages）→ **创建** → **Workers** → 选 **从 Hello World 开始**。
3. 名字填 `ruzhu-ai`，点 **部署**。
4. 部署完成后点 **编辑代码**，把编辑器里的内容全部删掉，粘贴本目录的 `worker.js`，点右上角 **部署**。
5. 回到这个 Worker 的页面 → **设置** → **变量和机密** → **添加**：
   - 类型：**密钥**（Secret）
   - 名称：`GROQ_API_KEY`
   - 值：你的 Groq Key（`gsk_` 开头）
   - 保存并部署。
6. 复制 Worker 的地址，形如 `https://ruzhu-ai.<你的子域>.workers.dev`。浏览器打开它，看到 `{"ok":true,...}` 就是部署成功。

## 接进游戏

把第 6 步的地址填到 `web-25d/fable/src/npc.js` 的 `RELAY_URL`，然后构建：

```
python3 web-25d/fable/build.py
cp web-25d/fable.html web-25d/index.html
```

上线前想先试：在游戏地址后面加 `?relay=<Worker 地址>`，比如
`https://wildcolaa.github.io/ruzhu-notice/web-25d/?relay=https://ruzhu-ai.xxx.workers.dev`

## 防滥用（都在 `worker.js` 顶部，可以改）

| 设置 | 默认 | 作用 |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | GitHub Pages、githack、本机 8000 端口 | 只有这些网站能调用。换域名时要加进去 |
| `MODELS` | 三个 Groq 免费模型 | 只能用这些模型 |
| `RATE_PER_MIN` | 30 | 每个 IP 每分钟请求数 |
| `MAX_TOKENS` / `MAX_CHARS` / `MAX_MESSAGES` | 300 / 6000 / 16 | 单次请求的大小上限 |

说明：来源检查只能挡住普通的盗用，脚本可以伪造来源。但 Key 本身不会泄露，最坏情况也只是免费额度被用完，Groq 免费层不会扣费。万一被刷，到 Groq 后台重新生成一个 Key，回第 5 步替换即可，游戏不用改。

## 换 Key

Groq 后台新建 Key → Cloudflare 里 `GROQ_API_KEY` 改成新值 → 部署。旧 Key 在 Groq 后台删除。
