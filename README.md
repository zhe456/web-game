# Web Game

一個使用 HTML、CSS 與 JavaScript 打造的瀏覽器網頁遊戲專案，採用 Vite 作為開發工具。

## 功能特色

- 使用 Vite 作為開發伺服器與建置工具
- Canvas 遊戲畫面
- 支援熱更新（HMR）

## 開始使用

### 前置需求

- Node.js 18+（建議 20+）
- npm 9+

### 安裝

```bash
npm install
```

### 開發

```bash
npm run dev
```

### 建置

```bash
npm run build
```

### 預覽建置結果

```bash
npm run preview
```

## 專案結構

```
web-game/
├── index.html       # 入口頁面
├── src/
│   ├── main.js      # 遊戲主程式
│   └── style.css    # 樣式
├── .env.example     # 環境變數範例
├── .gitignore
└── package.json
```

## 環境變數

複製 `.env.example` 為 `.env` 並填入實際值：

```bash
cp .env.example .env
```

## License

MIT