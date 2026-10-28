# 日本藥妝網店｜第二版（Next.js），等待部署上線

日本藥妝代購網店的正式版，由 Claude 於 2026年10月28日以 Next.js 重寫。第一版是 claude.ai 上的 Artifact，只限登入 Claude 的人使用；第二版放在 Vercel，客人不用登入就可以直接瀏覽和落單。本機資料夾是主版本。

## 架構
- 網站：Next.js 16（App Router）＋ React 19 ＋ TypeScript，放在 Vercel
- 資料庫、管理員登入、產品相片：Supabase
- 店面和產品頁在伺服器預先產生，每分鐘最多更新一次；管理員修改產品或設定後會即時更新
- 客人送出預訂單時，由資料庫函數重新計價、檢查限量和優惠碼，並即時記錄訂單，價錢不會被瀏覽器竄改
- 優惠碼、成本、匯率和訂單只有管理員可讀，資料庫權限規則把關

## 檔案
- app/：頁面（首頁、產品頁 /p/產品編號、管理介面 /admin、更新快取的介面）
- components/Storefront.tsx：店面、產品、預訂清單、分享及查詢補貨
- components/Admin.tsx：管理介面（訂單、產品、採購清單、專題、店舖設定）
- lib/：共用計算（特價、限量、運費、香港時間）及資料讀取
- supabase/schema.sql：資料表、權限規則、落單函數、相片空間
- supabase/seed.sql：由舊版搬過來的示範資料，以 scripts/make_seed.py 產生
- 舊版/index.html：第一版網店，只作參考

## 與第一版的分別
- 客人不用登入 Claude
- 訂單由網站直接記錄，管理員不用再貼上 WhatsApp 訊息入單；客人仍會把預訂單以 WhatsApp 傳來確認
- 優惠碼改為由伺服器核對，網頁上不再公開整張優惠碼清單
- 每件產品有自己的網址，分享到 WhatsApp 或社交平台時會顯示產品名稱和相片
- 截單和特價時間一律以香港時間計算

## 管理員
管理員以電郵及密碼登入 /admin。帳戶在 Supabase 後台 Authentication 建立，電郵要加入 admins 資料表才有管理權限。

## 網上版
- 網站：待部署
- 第一版（Artifact）：https://claude.ai/code/artifact/79707fd5-1f92-4dbf-ac8f-90663384d275

## 同步紀錄
- 2026-10-28：第二版完成，本機以模擬資料庫測試店面、落單、優惠碼、管理介面、相片上載及權限，全部正常
- 2026-10-28：Supabase 項目 jp-drugstore（新加坡）建立，資料表、權限及示範資料已匯入；Vercel 項目 jp-drugstore 建立，伺服器設在香港

## 下一步
在 Supabase 建立資料庫，經 GitHub 部署到 Vercel，再建立管理員帳戶。
