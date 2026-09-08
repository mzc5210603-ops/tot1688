# 📰 NewsHub 资讯聚合网站

> **零运维纯前端资讯聚合站 |  纯 HTML/CSS/JS（无框架 | 自动部署 GitHub Pages | 每日自动更新内容

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📰 **首页信息流** | 卡片式布局，展示最新资讯标题、摘要、来源、时间 |
| 🏷️ **分类筛选** | 7 大分类：全部/财经/科技/娱乐/体育/健康/科学 |
| 🔍 **搜索功能** | 实时搜索标题、摘要、来源 |
| 🌙 **暗色模式** | 一键切换亮/暗主题，跟随系统偏好，记忆选择 |
| 📄 **分页显示** | 每页 12 条，智能分页导航 |
| 📱 **响应式设计** | 完美适配桌面/平板/手机三端 |
| ⚡ **静态部署** | 纯静态 HTML，零服务器成本，部署 GitHub Pages |
| 🔄 **每日自动更新** | GitHub Actions 定时工作流，每天早上 8 点自动拉取最新资讯提交到仓库 |

---

## 📁 项目结构

```
.
├── index.html                  # 主页面（入口）
├── css/
│   └── style.css               # 全部样式（含暗色主题、响应式）
├── js/
│   └── app.js                  # 前端交互逻辑（无任何框架依赖）
├── data/
│   └── news.json               # 预渲染的资讯数据（被 workflow 自动更新）
├── scripts/
│   └── fetch-news.js           # 数据抓取脚本（Node.js，调用多 API 源）
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions：每日定时抓取 + 自动部署 Pages
├── package.json                # 依赖 & npm 脚本
├── .env.example                # API Key 配置模板（复制为 .env 本地用）
├── .gitignore
└── README.md
```

---

## 🚀 快速部署（3 步完成，零成本）

### 第 1 步：上传到 GitHub

1. 在 GitHub 创建新仓库（例如命名为 `newshub` 或任何你喜欢的名字）
2. 将本项目所有文件上传到仓库（或 Git push 推送到 `main` 分支）

### 第 2 步：开启 GitHub Pages

1. 进入仓库 **Settings** → 左侧 **Pages**
2. **Build and deployment** → **Source** 选择 **GitHub Actions**（重要！不要选 Deploy from branch）
   - （如果 Actions 部署第一次运行后也会自动识别到 Enviroment
3. 保存，等 1-2 分钟即可通过 `https://<你的用户名>.github.io/<仓库名>/` 访问

### 第 3 步（可选，强烈推荐）：配置资讯 API Keys

不配置也能用，网站会使用内置示例数据 + RSS 公共源。配置后拉取真实新闻：

1. 免费注册获取以下 API（免费额度足够个人使用）：
   - NewsAPI.org: <https://newsapi.org>（100 次/天免费）
   - GNews.io: <https://gnews.io>（100 篇/天免费）
   - MediaStack: <https://mediastack.com>（500 次/月免费）

2. 进入仓库 **Settings** → **Secrets and variables** → **Actions** → 点击 **New repository secret**
3. 依次添加以下 3 个 Secret（任意配置其中 1 个即可，越多数据源越丰富）：

   | Name | Value | 说明 |
   |------|-------|------|
   | `NEWS_API_KEY` | 从 newsapi.org 复制的 Key | **推荐**，主流英文资讯源 |
   | `GNEWS_API_KEY` | 从 gnews.io 复制的 Key | 备用 |
   | `MEDIASTACK_API_KEY` | 从 mediastack.com 复制的 Key | 备用 |

4. 保存后，手动触发一次工作流：进入仓库 **Actions** → 左侧 **Daily News Update & Deploy** → 右侧 **Run workflow** 绿色按钮

---

## ⏰ 自动更新机制

工作流文件 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 配置：

- **定时触发**：每天 **北京时间 08:00** 自动执行
  - 抓取最新资讯 → 写入 `data/news.json` → 自动 git commit 回仓库 → 触发 GitHub Pages 重新部署
- **手动触发**：随时到 Actions 页面点击 Run workflow 立即更新
- **推送触发**：修改 HTML/CSS/JS 代码推送到 main 也会自动重新部署
- **多级兜底**：
  1. 优先使用你配置的 Secrets API Keys（真实资讯）
  2. 无 Key 则使用 rss2json.com 公共 RSS 转换服务（10+ 主流媒体真实 RSS 源）
  3. 全部失败则生成内置示例数据，保证网站永远能访问

---

## 💻 本地开发预览

需要 Node.js 18+：

```bash
# 1. 安装依赖
npm install

# 2. （可选）复制并配置 API Key
cp .env.example .env
# 编辑 .env 填入你的 API Keys

# 3. 拉取最新资讯（可选，跳过也行，data/news.json 已有示例数据
npm run fetch

# 4. 启动本地 HTTP 服务器预览
npm run serve
# 浏览器打开 http://localhost:8080
```

或直接任意静态文件服务器（Python）：
```bash
python -m http.server 8080
```

---

## 🎨 自定义指南

### 修改资讯分类
编辑 3 处：
1. `index.html` 的 `<nav class="categories">` 中的按钮
2. `js/app.js` 顶部的 `CATEGORY_LABELS` 和 `CATEGORY_ICONS` 映射
3. `scripts/fetch-news.js` 顶部的 `CATEGORIES` 数组

### 调整每页条数
修改 `js/app.js` 的 `CONFIG.ITEMS_PER_PAGE`（默认 12）

### 修改定时时间
编辑 `.github/workflows/deploy.yml` 的 `cron` 字段：
```yaml
schedule:
  - cron: '0 0 * * *'   # UTC 0 点 = 北京 8 点
  # 改成其他时间参考：https://crontab.guru
```

### 配色主题
`css/style.css` 顶部 `:root` 变量修改色值：
```css
:root {
    --accent: #3b82f6;  /* 主色调 */
    /* ...
}
```

---

## 🔧 技术栈说明

- **零框架**：无 React/Vue/jQuery，纯原生 JS + CSS + HTML
- **多数据源优先级**：NewsAPI → GNews → MediaStack → RSS2JSON → 示例数据
- **图片资源**：Unsplash CDN + 无图时显示分类图标占位
- **CORS 处理**：所有数据静态化到 `data/news.json`，浏览器直接读取本地文件，无跨域问题
- **数据去重**：基于标题 hash 去重，避免不同源重复内容
- **懒加载**：文章图片 `loading="lazy"`，首屏加载更快

---

## ❓ 常见问题

**Q: 第一次部署后显示的是示例数据，怎么换真实数据？**
A: 配置 Secrets 后手动触发 Actions 运行一次 workflow 即可，或者等第二天早上 8 点自动运行。

**Q: 工作流运行失败怎么办？**
A: 进入仓库 Actions 查看失败日志。常见原因：API Key 填错、免费额度用完、网络问题。不用管，工作流有兜底机制，会自动回退到 RSS/示例数据保证网站可用。

**Q: 可以改成中文资讯吗？**
A: 可以，编辑 `scripts/fetch-news.js` 中 API 请求的 `language=en` 改成 `language=zh`（GNews/MediaStack 支持中文），并换成中文源 RSS。

**Q: GitHub Pages 访问慢怎么办？**
A: 可以把仓库同步到 Vercel/Netlify/Cloudflare Pages，导入仓库一键部署，同样支持 Actions 自动提交触发重部署，速度更快。

---

## 📄 许可说明

资讯内容版权归原始来源所有，本项目仅做聚合展示学习使用。
