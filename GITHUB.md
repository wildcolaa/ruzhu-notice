# GitHub 仓库与运行方式

这份仓库保存《入住须知》的完整源码、预构建前端、启动脚本和测试。克隆或下载后，按照 README 运行 `bash start.sh`，即可在本机浏览器进入公寓。

## 仓库中的自动检查

推送 main、提交 Pull Request 或手动运行 Actions，会执行：

- Python 游戏规则 / API 测试。
- 语音按住释放与选择题状态测试。
- 前端类型检查与生产构建。
- 模拟模式从入住、取证到完整结局、回溯、读档的实际 HTTP 流程。

检查不使用真实 Groq 密钥，也不会消耗模型额度。GitHub 工作流执行结果需以上传后 Actions 页面为准。

## 配置自己的 Groq

复制 `.env.example` 为 `.env`，在运行游戏的机器上设置 `GROQ_API_KEY`，再启动后端。仓库不包含作者的密钥、玩家存档、聊天数据库或本地虚拟环境。没有密钥也能通过文字模拟模式完成案件。

## 仓库地址与试玩地址

GitHub 仓库用于保存、下载和协作开发源码。这个版本使用 Python FastAPI 和 SQLite，GitHub Pages 仅提供静态托管，无法直接执行本项目的后端，所以仓库地址不是完整游戏的在线试玩地址。

要提供公网试玩，需要另行部署 Python 服务、配置服务端密钥和持久化数据库，并调整当前只允许 localhost 的访问校验与公网会话安全配置。本次上传保留现有本机运行方式，不会直接把本地服务暴露到公网。

参考：[GitHub Pages 托管范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[GitHub Actions](https://docs.github.com/en/actions)。
