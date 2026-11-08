# Char-Insp 角色靈感庫

用來收集遊戲角色靈感的小工具。每個角色就是一個「資料夾」，裡面有固定的欄位。文字資料可以匯出成 JSON 或 CSV，圖片另外打包成 ZIP，方便放進遊戲專案。

**線上版（GitHub Pages）：** https://dot7dot.github.io/Char-Insp/

## 使用方式

直接打開上面的線上版，或在本機用瀏覽器開啟 `index.html` 即可，不需要安裝任何東西。

如果你的瀏覽器在直接開檔案時無法儲存資料，可以在專案資料夾開一個本機伺服器：

```bash
python3 -m http.server 8000
# 然後打開 http://localhost:8000
```

## 角色欄位

| 欄位 | 說明 |
| --- | --- |
| Name | 角色名稱 |
| English Name | 英文名稱 |
| Description | 描述 |
| Icon | 小標誌圖片，可上傳多張 |
| Head | 大頭照，可上傳多張 |
| Picture | 角色詳細圖，可上傳多張 |
| Dialogue | 對話，可以一直新增、修改、刪除 |

欄位是固定的，不能新增自訂欄位。

- 點左邊的 **新增角色資料夾** 建立角色
- 圖片：點「＋ 新增圖片」或把圖片拖曳到該區塊（可一次選多張）；滑過縮圖可以「← 往前移」調整順序或「移除」，點縮圖可開啟原圖
- 修改後會自動儲存

## 資料儲存

資料存在**瀏覽器的 IndexedDB** 裡（只存在這台電腦的這個瀏覽器、這個網址底下）。清除瀏覽器網站資料會把資料一起刪掉；線上版與本機開啟的 `index.html` 也是兩份不同的資料。

## 匯出

點左上角的 **匯出**，可以選擇：

- **範圍**：全部角色，或只匯出目前選擇的角色
- **文字資料**：JSON、CSV 或不匯出文字（只含文字，不含圖片）
- **圖片（ZIP）**：勾選後另外下載一個 ZIP，裡面是所有圖片原檔

> 同時匯出文字與 ZIP 時會下載兩個檔案，瀏覽器第一次可能會詢問「是否允許下載多個檔案」，請按允許。

### JSON 格式

```json
{
  "app": "Char-Insp",
  "version": 2,
  "exportedAt": "2026-11-08T00:00:00.000Z",
  "count": 1,
  "characters": [
    {
      "id": "f6ddabad-30db-4650-9f44-dea84bf9db0f",
      "name": "艾莉絲",
      "englishName": "Alice",
      "description": "冷靜的魔法師",
      "dialogues": ["你好，旅人。", "這裡很危險，小心點。"],
      "createdAt": "2026-11-08T00:00:00.000Z",
      "updatedAt": "2026-11-08T00:00:00.000Z"
    }
  ]
}
```

### CSV 格式

欄位：`ID, Name, English Name, Description, Dialogue`

- 檔案為 UTF-8（含 BOM），Excel 直接開中文不會亂碼
- 一個角色一列；多句 Dialogue 放在同一格，以換行分隔

### 圖片 ZIP 結構

每個角色一個資料夾，名稱是 English Name（沒有的話用 Name；重複時加上 `_2`、`_3`）。檔名前面的編號就是你在畫面上排的順序：

```
characters_20261108-1200_images.zip
├── Alice/
│   ├── icon/
│   │   ├── 01_icon_star.png
│   │   └── 02_icon_moon.png
│   ├── head/
│   │   └── 01_head.png
│   └── picture/
│       ├── 01_full_body.png
│       └── 02_full_back.png
└── Bruno/
    └── ...
```

## 檔案結構

```
index.html      介面
css/style.css   樣式（支援深色模式、手機版）
js/db.js        IndexedDB 儲存
js/zip.js       ZIP 打包（不需外部函式庫）
js/export.js    JSON / CSV / 圖片 ZIP 匯出
js/app.js       主程式
.nojekyll       讓 GitHub Pages 直接提供靜態檔案
```

## 發布到 GitHub Pages

Repository → **Settings → Pages** → Build and deployment：

- Source：**Deploy from a branch**
- Branch：**main**、資料夾 **/ (root)** → Save

約一分鐘後就能在 https://dot7dot.github.io/Char-Insp/ 使用，之後每次更新 `main` 都會自動重新發布。
