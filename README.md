# 拡張テーブル

JSONデータを取得してHTMLテーブルにレンダリングする、サーバーレスのウェブアプリケーションです。インライン編集、ページネーション、フィルター、ソート機能を備えています。
githubやRedmineなど外部のアプリと連携して利用することを想定して作成し，実務でもガントチャート作成ツールの一部として利用しています。


## 機能

| 機能 | 説明 |
|---|---|
| インライン編集 | セルをクリックしてその場で編集。Enter/Tabで確定、Escapeでキャンセル |
| ページネーション | 前へ・次へボタン＋ページ番号ボタン（最大7個表示、端っこ省略） |
| 部署フィルター | ドロップダウンで部署を指定して絞り込み |
| グローバル検索 | テキスト入力ですべてのカラムを対象に部分一致検索（日本語対応） |
| ソート | ヘッダクリックで昇順（▲）→ 降順（▼）→ なし をサイクル切替 |
| 表示件数 | 5, 10, 25, 50 件から選択 |
| コメント付与 | セルを右クリックしてコメントを追加できる |

## ファイル構成

### 社員一覧
```
src/
├── index.html         # メインHTML
├── style.css          # スタイル定義
├── script.js          # 全ロジック（vanilla JavaScript）
├── comment-manager.js # コメント付与ロジック（vanilla JavaScript)
├── README.md          # このファイル
└── data/
    └── data.json      # 列定義と社員データ
```

### 社員一覧 2
```
src2/
├── index.html         # メインHTML
├── style.css          # スタイル定義
├── script.js          # 全ロジック（vanilla JavaScript）
├── README.md          # このファイル
└── data/
    └── data.json      # 列定義と社員データ
```

### タスク表サンプル
```
src3/
├── index.html         # メインHTML
├── style.css          # スタイル定義
├── script.js          # 全ロジック（vanilla JavaScript）
├── comment-manager.js # コメント付与ロジック（vanilla JavaScript)
├── README.md          # このファイル
└── data/
    └── task.json      # 列定義とタスクデータ
```

### タスク表サンプル 2
```
src4/
├── index.html         # メインHTML
├── style.css          # スタイル定義
├── script.js          # 全ロジック（vanilla JavaScript）
├── README.md          # このファイル
└── data/
    └── task.json      # 列定義とタスクデータ
```

## 使い方

1. ローカルサーバーで `src/` ディレクトリを提供する
   ```bash
   python3 -m http.server 8000 -d src/
   ```
2. ブラウザで `http://localhost:8000/` にアクセス
3. テーブルを操作する

## 技術仕様

- **スタック**: HTML / CSS / vanilla JavaScript（外部ライブラリなし）
- **データ形式**: JSON（columns配列 + rows配列）
- **データ管理**: `allRows`（全件）と `filteredRows`（フィルター後）を分離、メモリ保持
- **レスポンシブ**: テーブルは横スクロール対応
- **ソート比較**: id列は数値比較、他は `localeCompare('ja')` で日本語対応

