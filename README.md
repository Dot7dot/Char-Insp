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
- 圖片：點「＋ 新增圖片」或把圖片拖曳到該區塊（可一次選多張，手機可直接拍照）；滑過縮圖可以「← 往前移」調整順序或「移除」，點縮圖可放大檢視
- 修改後會自動儲存

## 資料儲存

資料存在**瀏覽器的 IndexedDB** 裡（只存在這台裝置的這個瀏覽器、這個網址底下）。

- 上傳圖片時會立刻把圖片內容完整複製一份存起來（iPhone 從相簿 / 相機選的照片只是暫存檔，之後會被系統刪除）。
- 圖片本體與角色文字分開儲存，修改文字不會重寫圖片。
- 第一次上傳圖片時會向瀏覽器要求「持久保存」，降低被自動清除的機會。
- 清除瀏覽器網站資料會把資料一起刪掉；線上版與本機開啟的 `index.html` 也是兩份不同的資料。
- iPhone Safari 若超過 7 天沒有開啟這個網站，系統可能會清除網站資料；請定期按「完整備份」，或把網站「加入主畫面」使用。
- 如果有圖片顯示「無法讀取」，代表那張圖片的資料已經遺失，請移除後重新上傳。

## 完整備份 / 匯入還原

左側下方有兩個按鈕：

- **完整備份**：把所有角色（文字、對話、所有圖片與排列順序）打包成一個 `char-insp-backup_YYYYMMDD-HHmm.zip` 下載。
- **匯入還原**：選擇備份檔後會先顯示備份時間與內容，再選擇還原方式：
  - **合併（建議）**：保留目前的角色；備份裡相同的角色（同一個資料夾）會換成備份的版本，其餘新增進來。
  - **全部取代**：還原後資料會和備份完全一樣，備份裡沒有的角色會被刪除（會再跟你確認一次）。

還原時會先把備份的資料寫入，全部成功後才刪除多餘的角色；如果中途失敗，原本的資料不會被清空。

按鈕下方會顯示這台裝置「上次備份」的時間，超過 7 天（或從未備份）會以紅字提醒。換手機 / 換電腦時，在舊裝置按「完整備份」，把 ZIP 傳到新裝置後按「匯入還原」即可。

> 「匯出」產生的 JSON / CSV / 圖片 ZIP 是給遊戲專案用的，**不能**拿來還原；要還原請用「完整備份」產生的檔案。

### 備份檔結構

```
char-insp-backup_20261108-1630.zip
├── backup.json          所有角色資料（含圖片清單與順序）
└── images/
    ├── <圖片ID>.png
    └── <圖片ID>.jpg
```

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
js/zip.js       ZIP 打包 / 讀取（不需外部函式庫）
js/export.js    JSON / CSV / 圖片 ZIP 匯出
js/backup.js    完整備份 / 匯入還原
js/app.js       主程式
.nojekyll       讓 GitHub Pages 直接提供靜態檔案
```

## 發布到 GitHub Pages

Repository → **Settings → Pages** → Build and deployment：

- Source：**Deploy from a branch**
- Branch：**main**、資料夾 **/ (root)** → Save

約一分鐘後就能在 https://dot7dot.github.io/Char-Insp/ 使用，之後每次更新 `main` 都會自動重新發布。
