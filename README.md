# Char-Insp 角色靈感庫

用來收集遊戲角色靈感的小工具。每個角色就是一個「資料夾」，裡面有固定的欄位，可以匯出成 JSON 或 CSV 給遊戲專案用。

## 使用方式

不需要安裝任何東西，直接用瀏覽器（Chrome / Edge / Firefox / Safari）開啟 `index.html` 就可以用。

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
| Icon | 小標誌圖片 |
| Picture | 完整的角色詳細圖 |
| Head | 大頭照 |
| Dialogue | 對話，可以一直新增、修改、刪除 |

欄位是固定的，不能新增自訂欄位。

- 點左邊的 **新增角色資料夾** 建立角色
- 圖片可以點擊上傳或直接拖曳進框內，也可以更換或移除
- 修改後會自動儲存

## 資料儲存

資料存在**瀏覽器的 IndexedDB** 裡（只存在這台電腦的這個瀏覽器）。清除瀏覽器網站資料會把資料一起刪掉，請記得定期用「匯出 → JSON（內嵌圖片）」備份。

## 匯出

點左上角的 **匯出**，可以選擇：

- **格式**：JSON 或 CSV
- **範圍**：全部角色，或只匯出目前選擇的角色
- **內嵌圖片（Base64）**：勾選時圖片會以 `data:` URL 存進檔案；不勾選只輸出原始檔名
  （選 CSV 時預設不勾，因為 Excel 一個儲存格最多約 32,000 字元，放不下圖片）

### JSON 格式

```json
{
  "app": "Char-Insp",
  "version": 1,
  "exportedAt": "2026-11-08T00:00:00.000Z",
  "count": 1,
  "characters": [
    {
      "id": "f6ddabad-30db-4650-9f44-dea84bf9db0f",
      "name": "艾莉絲",
      "englishName": "Alice",
      "description": "冷靜的魔法師",
      "icon":    { "fileName": "alice_icon.png", "mimeType": "image/png", "dataUrl": "data:image/png;base64,..." },
      "picture": { "fileName": "alice_full.png", "mimeType": "image/png", "dataUrl": "data:image/png;base64,..." },
      "head":    null,
      "dialogues": ["你好，旅人。", "這裡很危險，小心點。"],
      "createdAt": "2026-11-08T00:00:00.000Z",
      "updatedAt": "2026-11-08T00:00:00.000Z"
    }
  ]
}
```

沒有上傳的圖片是 `null`；不內嵌圖片時，圖片物件裡沒有 `dataUrl`。

### CSV 格式

欄位：`ID, Name, English Name, Description, Icon, Picture, Head, Dialogue`

- 檔案為 UTF-8（含 BOM），Excel 直接開中文不會亂碼
- 一個角色一列；多句 Dialogue 放在同一格，以換行分隔
- Icon / Picture / Head 欄位是檔名（或勾選內嵌時為 `data:` URL）

## 檔案結構

```
index.html      介面
css/style.css   樣式（支援深色模式、手機版）
js/db.js        IndexedDB 儲存
js/export.js    JSON / CSV 匯出
js/app.js       主程式
```
