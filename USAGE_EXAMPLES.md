# Usage Examples

このドキュメントでは、jGrants MCP Serverの具体的な使用例を紹介します。

## Claude Desktop での使用例

### 1. 補助金を検索する

```
IT関連の補助金を検索してください。
```

MCPサーバーは `search_subsidies` ツールを使用して検索を実行します。

### 2. 詳細情報を取得する

```
ID: a0WJ200000CDR9HMAX の補助金の詳細を教えてください。
```

`get_subsidy_detail` ツールが実行され、詳細情報とダウンロードされたファイルのリストが表示されます。

### 3. 添付ファイルを読む

```
補助金ID a0WJ200000CDR9HMAX の公募要領.pdf の内容を教えてください。
```

`get_file_content` ツールがPDFをMarkdown形式に変換して内容を表示します。

### 4. 統計情報を取得する

```
現在受付中の補助金の統計を教えてください。
```

`get_subsidy_overview` ツールが締切期間別、金額規模別の統計を表示します。

## コマンドライン直接実行の例

### MCP プロトコルで直接通信

```bash
# Tools一覧を取得
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node dist/index.js

# search_subsidiesを実行
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_subsidies","arguments":{"keyword":"IT"}}}' | \
  node dist/index.js

# pingを実行
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}' | \
  node dist/index.js
```

## プログラムからの使用例

### Node.js/TypeScript

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function searchSubsidies() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['path/to/jgrants-mcp-server/dist/index.js'],
  });

  const client = new Client(
    { name: 'my-app', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // ツールを実行
  const result = await client.callTool({
    name: 'search_subsidies',
    arguments: { keyword: 'IT' },
  });

  console.log(result);
  await client.close();
}

searchSubsidies();
```

## 検索のヒント

### キーワードの選び方

**良い例:**
- "IT導入" - 具体的で的確
- "DX" - 略語でも検索可能
- "設備投資" - 一般的な用語

**改善の余地がある例:**
- "お金" - 曖昧すぎる
- "補助金" - すべての補助金がヒット

### 絞り込みの活用

```
東京都の製造業向けの補助金を検索してください。
従業員50名以下が対象の補助金を教えてください。
```

MCPサーバーは自動的に適切なパラメータで検索します。

## よくある使用パターン

### パターン1: 締切が近い補助金を見つける

```
1. "締切が近い補助金を教えてください"
   → get_subsidy_overview で統計取得
   
2. "この中で一番締切が近いものの詳細を教えてください"
   → get_subsidy_detail で詳細取得
   
3. "公募要領を確認したいです"
   → get_file_content でPDF内容取得
```

### パターン2: 特定の業種・地域で検索

```
1. "大阪府の飲食業向け補助金を検索"
   → search_subsidies を実行
   
2. "一番補助額が大きいものは？"
   → LLMが結果を分析して回答
   
3. "その詳細を教えてください"
   → get_subsidy_detail で詳細取得
```

### パターン3: 統計分析

```
1. "現在の補助金の状況を教えてください"
   → get_subsidy_overview で統計取得
   
2. "CSV形式で出力してください"
   → get_subsidy_overview(output_format="csv") を実行
```

## トラブルシューティング

### エラー: "keyword は2〜255文字の非空文字列で指定してください"

→ キーワードが短すぎます。2文字以上で検索してください。

### エラー: "ファイルが見つかりません"

→ まず `get_subsidy_detail` でファイルをダウンロードしてください。

### エラー: "HTTPエラー: 404"

→ 補助金IDが正しくない可能性があります。IDを確認してください。

## 高度な使用例

### 複数の条件を組み合わせる

```
東京都または神奈川県で、製造業または情報通信業が対象で、
従業員100名以下の企業向けの補助金を検索してください。
```

LLMが自然言語を解釈して適切なAPI呼び出しに変換します。

### ファイル内容の要約

```
この補助金の公募要領から、申請期限、補助上限額、
対象経費を教えてください。
```

`get_file_content` でPDFを取得後、LLMが内容を分析して回答します。
