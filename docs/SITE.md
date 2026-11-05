# 产品主页维护

官网：<https://adou.grout.cn/>

主页源码在 `site/`，零依赖静态 HTML/CSS，不需要构建；安装包仍由 CNB Release 分发，不放在 Pages 上。

## 本地预览

```powershell
python -m http.server 8080 --directory site
```

打开 `http://127.0.0.1:8080/`。

## 文件结构

```text
site/
├─ index.html          产品主页
├─ changelog.html      更新日志
├─ privacy.html        隐私政策
├─ 404.html            自定义 404
├─ styles.css
├─ script.js           仅移动端菜单收起
├─ robots.txt          Allow + Sitemap
├─ sitemap.xml         首页 / 更新日志 / 隐私
└─ assets/
   ├─ brand-mark.png
   ├─ mascot-empty.webp
   ├─ icon.png / favicon.ico
   ├─ og.png           1200×630 分享图
   └─ screenshots/     真实 UI 截图（随版本更新）
```

## EdgeOne 部署

- 平台：EdgeOne Pages（Makers），项目名 `adouofd`
- Git：CNB `Zzuser/adouOFD`（仓库同步自 GitHub），分支 `main`；EdgeOne 只监听 CNB，推送 GitHub/GitCode 不会触发部署
- 根目录：`./`
- 安装命令：留空
- 构建命令：留空（必填时 `echo skip`）
- 输出目录：`site`
- 若控制台不接受上述组合：根目录 `site`、输出目录 `.`

## 域名与 HTTPS

- 域名：`adou.grout.cn`，CNAME → `adou.grout.cn.pages.dnsoe5.com`（以 EdgeOne 控制台当前值为准）
- 归属验证：TXT `edgeonereclaim.adou`，值从控制台复制，不要手抄截图
- 免费证书：HTTPS 配置 → 配置 → 免费证书 → 保存/申请；签发后建议开“强制 HTTPS”
- 中国大陆加速要求 `grout.cn` 已备案；DNS 记录线路类型用“默认”
- 自定义 404 已指向 `404.html`

## SEO

- `robots.txt` 允许全站抓取并声明 sitemap；`sitemap.xml` 更新 `lastmod` 后重新提交。
- 首页包含 `SoftwareApplication`、`WebSite`、`FAQPage` JSON-LD；FAQ 文案必须与页面可见内容一致。
- 截图用 WebP（`assets/screenshots/*.webp`），`og.png` 保留 PNG 供社交分享。
- 免费提交入口：百度搜索资源平台、Google Search Console、Bing Webmaster Tools、360 站长平台、搜狗站长平台、神马搜索。验证文件放 `site/` 根目录后部署。
- 内容页是最大的免费 SEO 杠杆：优先补“OFD 文件怎么打开”“OFD 转 PDF”“电子发票合并打印”“Markdown 转 PDF”等长尾页，每页独立 title/description、H1、FAQ 和内部链接。
- 外链：GitHub/GitCode/CNB 项目页、软件站投稿、V2EX/知乎/B 站真实分享；不做买排名、采集互链和关键词堆砌。
- 可选 IndexNow：放 key 文件到根目录，发布后 ping `api.indexnow.org`（Bing/Yandex/Naver，百度不支持）。

## 发版检查清单

1. 更新 `site/index.html` 的版本号、安装包大小、CNB Release tag、SHA256 链接
2. 更新 `site/changelog.html` 的最新版本条目
3. 用当前版本重截关键 UI 截图，替换 `site/assets/screenshots/`
4. 更新 `site/assets/og.png`（可从最新 `viewer.png` 裁 1200×630）
5. 本地预览并检查手机宽度，确认无控制台错误和坏链接
6. 更新 `site/sitemap.xml` 的 `lastmod`；同步/推送 CNB `main`（GitHub 推送后可在 CNB 点“同步”），EdgeOne 自动部署
7. 确认 `https://adou.grout.cn/`、`/robots.txt`、`/sitemap.xml` 均返回 200
8. 确认下载按钮指向当前 CNB Release，SHA256 文件可访问；在搜索后台重新提交 sitemap

## 注意

- 发版后必须同步 CNB `main`：EdgeOne 关联的是 `cnb.cool/Zzuser/adouOFD`，不是 GitHub；只推 GitHub 会看到旧版本。
- 主站不自动拉取最新版本：浏览器直接请求 CNB 清单会被 CORS 拦截；版本与下载链接是静态的。如需自动最新版，用 EdgeOne Edge Function 做同源代理。
- canonical / og:url / og:image / JSON-LD 目前假设 `https://adou.grout.cn`；换域名要同步修改。
- 备案号拿到后加入 `index.html` 的 `footer-bottom`。
- GitHub Pages 不作为镜像；GitHub 仓库只在 About 的 Website 填官网地址。
