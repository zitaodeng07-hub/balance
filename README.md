# Balance

收入即时可视化 + 轻激励专注工具。输入月薪、税后口径和工作时间后，页面会实时显示本次专注已赚、今日已赚、时薪、计薪日和金币反馈。

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

## PWA 使用方式

该项目已经包含 PWA 所需的基础文件：

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icon.svg`
- `public/apple-touch-icon.svg`
- iPhone Safari 主屏幕 meta 标签

部署到 HTTPS 后，可在 iPhone 上通过 Safari 添加到主屏幕：

1. 用 iPhone Safari 打开部署后的 HTTPS 地址。
2. 点击底部分享按钮。
3. 选择“添加到主屏幕”。
4. 确认名称为 `Balance`。
5. 从主屏幕图标打开即可获得接近 App 的体验。

## 部署到 Vercel

推荐方式：

1. 把项目上传到 GitHub。
2. 登录 Vercel，导入该仓库。
3. Framework 选择 `Vite`。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 部署完成后，用 Vercel 提供的 `https://...vercel.app` 地址在 iPhone Safari 打开。

项目已包含 `vercel.json`，会自动配置 PWA 相关响应头和单页应用回退。

## 部署到 Netlify

推荐方式：

1. 把项目上传到 GitHub。
2. 登录 Netlify，导入该仓库。
3. Build Command 使用 `npm run build`。
4. Publish Directory 使用 `dist`。
5. 部署完成后，用 Netlify 提供的 HTTPS 地址在 iPhone Safari 打开。

项目已包含 `netlify.toml`，会自动配置 PWA 相关响应头和单页应用回退。

## 当前限制

- PWA 不是 App Store 原生 App，不能直接上架 App Store。
- iOS 对 PWA 后台运行、通知、音频自动播放和后台高频计时有系统限制。
- 金币音效需要用户先与页面交互后才会播放，这是浏览器策略。
- 收入和个税金额仅用于个人估算和可视化，不替代工资单、税务申报或公司结算结果。

## Supabase 登录配置

项目已接入 Supabase Auth，但默认不包含真实密钥。要启用注册/登录，需要：

1. 在 Supabase 创建项目。
2. 在 Project Settings > API 中复制 `Project URL` 和 `anon public` key。
3. 本地开发时创建 `.env.local`：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. GitHub Pages 自动构建时，在 GitHub 仓库 Settings > Secrets and variables > Actions 添加：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

5. 在 Supabase Authentication > URL Configuration 中设置：
   - Site URL: `https://zitaodeng07-hub.github.io/balance/`
   - Redirect URLs: `https://zitaodeng07-hub.github.io/balance/**`

未配置 Supabase 时，应用仍可正常使用，只是登录面板会显示“未配置”，工资配置继续保存在本机浏览器。
