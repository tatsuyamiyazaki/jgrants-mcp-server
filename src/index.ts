#!/usr/bin/env node
/**
 * jGrants MCP Server - Node.js Implementation
 * 
 * Model Context Protocol server for accessing Japan's jGrants subsidy information API.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { stringify } from 'csv-stringify/sync';

// Load environment variables
dotenv.config();

// Constants
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.jgrants-portal.go.jp/exp/v1/public';
const FILES_DIR = process.env.JGRANTS_FILES_DIR || 'tmp';

// Ensure files directory exists
await fs.mkdir(FILES_DIR, { recursive: true });

// HTTP client configuration
let httpClient: AxiosInstance;

function getHttpClient(): AxiosInstance {
  if (!httpClient) {
    httpClient = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'jgrants-mcp-server/0.1 (+https://github.com/tatsuyamiyazaki/jgrants-mcp-server)',
      },
      maxRedirects: 5,
    });
  }
  return httpClient;
}

// Error handling wrapper for HTTP requests
async function getJson(url: string, params?: Record<string, any>): Promise<any> {
  try {
    const client = getHttpClient();
    const response = await client.get(url, { params });
    return response.data;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return { error: `リクエストがタイムアウトしました: ${error.message}` };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { error: `APIサーバーへの接続に失敗しました: ${error.message}` };
    } else if (error.response) {
      return { error: `HTTPエラー: ${error.response.status}` };
    }
    return { error: `エラーが発生しました: ${error.message}` };
  }
}

// Internal search function
async function searchSubsidiesInternal(options: {
  keyword?: string;
  use_purpose?: string;
  industry?: string;
  target_number_of_employees?: string;
  target_area_search?: string;
  sort?: string;
  order?: string;
  acceptance?: number;
}): Promise<any> {
  const {
    keyword = '事業',
    use_purpose,
    industry,
    target_number_of_employees,
    target_area_search,
    sort = 'acceptance_end_datetime',
    order = 'ASC',
    acceptance = 1,
  } = options;

  const params: Record<string, any> = {
    keyword,
    sort,
    order,
    acceptance: String(acceptance),
  };

  if (use_purpose) params.use_purpose = use_purpose;
  if (industry) params.industry = industry;
  if (target_number_of_employees) params.target_number_of_employees = target_number_of_employees;
  if (target_area_search) params.target_area_search = target_area_search;

  const url = `${API_BASE_URL}/subsidies`;
  const data = await getJson(url, params);

  if (data.error) {
    return data;
  }

  if (data.result) {
    return {
      total_count: data.result.length,
      subsidies: data.result,
      search_conditions: Object.fromEntries(
        Object.entries(params).filter(([k]) => k !== 'limit')
      ),
    };
  }

  return { subsidies: [], total_count: 0 };
}

// Tool: search_subsidies
async function searchSubsidies(args: any): Promise<any> {
  const {
    keyword,
    use_purpose,
    industry,
    target_number_of_employees,
    target_area_search,
    sort = 'acceptance_end_datetime',
    order = 'ASC',
    acceptance = 1,
  } = args;

  // Validation
  if (!keyword || typeof keyword !== 'string' || keyword.trim().length < 2 || keyword.trim().length > 255) {
    return { error: 'keyword は2〜255文字の非空文字列で指定してください' };
  }

  if (![0, 1].includes(acceptance)) {
    return { error: 'acceptance は 0 または 1 を指定してください' };
  }

  const allowedSorts = ['created_date', 'acceptance_start_datetime', 'acceptance_end_datetime'];
  if (!allowedSorts.includes(sort)) {
    return { error: 'sort は created_date / acceptance_start_datetime / acceptance_end_datetime から選択してください' };
  }

  if (!['ASC', 'DESC'].includes(order.toUpperCase())) {
    return { error: 'order は ASC または DESC を指定してください' };
  }

  return searchSubsidiesInternal({
    keyword,
    use_purpose,
    industry,
    target_number_of_employees,
    target_area_search,
    sort,
    order: order.toUpperCase(),
    acceptance,
  });
}

// Tool: ping
async function ping(): Promise<any> {
  return {
    status: 'ok',
    server: 'jGrants MCP Server',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  };
}

// Tool: get_subsidy_overview
async function getSubsidyOverview(args: any): Promise<any> {
  const { output_format = 'json' } = args;

  const subsidies = await searchSubsidiesInternal({});

  if (subsidies.error) {
    return subsidies;
  }

  const stats: any = {
    total_count: subsidies.total_count || 0,
    by_deadline_period: {
      accepting: 0,
      this_month: 0,
      next_month: 0,
      after_next_month: 0,
    },
    by_amount_range: {
      under_1m: 0,
      under_10m: 0,
      under_100m: 0,
      over_100m: 0,
      unspecified: 0,
    },
    urgent_deadlines: [],
    high_amount_subsidies: [],
    statistics_generated_at: new Date().toISOString(),
  };

  const now = new Date();

  for (const subsidy of subsidies.subsidies || []) {
    // Deadline classification
    if (subsidy.acceptance_end_datetime) {
      try {
        const endDate = new Date(subsidy.acceptance_end_datetime);
        const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) {
          continue;
        } else if (daysLeft <= 30) {
          stats.by_deadline_period.this_month++;
        } else if (daysLeft <= 60) {
          stats.by_deadline_period.next_month++;
        } else {
          stats.by_deadline_period.after_next_month++;
        }

        // Urgent deadlines (within 14 days)
        if (daysLeft >= 0 && daysLeft <= 14) {
          stats.urgent_deadlines.push({
            id: subsidy.id,
            title: subsidy.title,
            days_left: daysLeft,
          });
        }
      } catch (e) {
        // Skip invalid dates
      }
    }

    // Amount classification
    const maxLimit = subsidy.subsidy_max_limit;
    if (maxLimit) {
      try {
        const amount = parseFloat(maxLimit);
        if (amount <= 1000000) {
          stats.by_amount_range.under_1m++;
        } else if (amount <= 10000000) {
          stats.by_amount_range.under_10m++;
        } else if (amount <= 100000000) {
          stats.by_amount_range.under_100m++;
        } else {
          stats.by_amount_range.over_100m++;
        }

        // High amount subsidies (50M+)
        if (amount >= 50000000) {
          stats.high_amount_subsidies.push({
            id: subsidy.id,
            title: subsidy.title,
            max_amount: amount,
          });
        }
      } catch (e) {
        stats.by_amount_range.unspecified++;
      }
    } else {
      stats.by_amount_range.unspecified++;
    }
  }

  if (output_format.toLowerCase() === 'csv') {
    return convertStatisticsToCsv(stats);
  }

  return stats;
}

// Convert statistics to CSV format
function convertStatisticsToCsv(stats: any): any {
  if (stats.error) {
    return stats;
  }

  const csvData: any = {};

  // Deadline statistics
  const deadlineRows = Object.entries(stats.by_deadline_period || {}).map(([period, count]) => {
    const periodLabel: Record<string, string> = {
      accepting: '受付中',
      this_month: '今月締切',
      next_month: '来月締切',
      after_next_month: '再来月以降',
    };
    return [periodLabel[period] || period, count];
  });
  csvData.deadline_statistics = stringify([['期間', '件数'], ...deadlineRows]);

  // Amount statistics
  const amountRows = Object.entries(stats.by_amount_range || {}).map(([range, count]) => {
    const rangeLabel: Record<string, string> = {
      under_1m: '100万円以下',
      under_10m: '1000万円以下',
      under_100m: '1億円以下',
      over_100m: '1億円超',
      unspecified: '金額未設定',
    };
    return [rangeLabel[range] || range, count];
  });
  csvData.amount_statistics = stringify([['金額規模', '件数'], ...amountRows]);

  // Urgent deadlines
  if (stats.urgent_deadlines?.length > 0) {
    const urgentRows = stats.urgent_deadlines.map((item: any) => [
      item.id || '',
      item.title || '',
      item.days_left || '',
    ]);
    csvData.urgent_deadlines = stringify([['補助金ID', '補助金名', '残り日数'], ...urgentRows]);
  }

  // High amount subsidies
  if (stats.high_amount_subsidies?.length > 0) {
    const highAmountRows = stats.high_amount_subsidies.map((item: any) => [
      item.id || '',
      item.title || '',
      item.max_amount?.toLocaleString() || '',
    ]);
    csvData.high_amount_subsidies = stringify([['補助金ID', '補助金名', '最大金額'], ...highAmountRows]);
  }

  csvData.total_count = stats.total_count || 0;
  csvData.statistics_generated_at = stats.statistics_generated_at || '';
  csvData.format = 'csv';

  return csvData;
}

// Tool: get_subsidy_detail
async function getSubsidyDetail(args: any): Promise<any> {
  const { subsidy_id } = args;

  if (!subsidy_id || typeof subsidy_id !== 'string' || !subsidy_id.trim()) {
    return { error: 'subsidy_id は非空の文字列で指定してください' };
  }

  const url = `${API_BASE_URL}/subsidies/id/${subsidy_id}`;
  const data = await getJson(url);

  if (data.error) {
    if (data.error.includes('404')) {
      return { error: `補助金ID '${subsidy_id}' が見つかりません` };
    }
    return data;
  }

  let subsidy: any;
  if (Array.isArray(data.result) && data.result.length > 0) {
    subsidy = data.result[0];
  } else if (typeof data.result === 'object') {
    subsidy = data.result;
  } else {
    return { error: '予期しないレスポンス形式' };
  }

  // Determine status
  let status = '受付終了';
  const endRaw = subsidy.acceptance_end_datetime;
  if (endRaw) {
    try {
      const endDate = new Date(endRaw);
      if (endDate >= new Date()) {
        status = '受付中';
      }
    } catch (e) {
      status = '受付中';
    }
  }

  const formattedResult: any = {
    id: subsidy.id || subsidy_id,
    title: subsidy.title || '',
    description: subsidy.detail || subsidy.description || '',
    subsidy_max_limit: subsidy.subsidy_max_limit,
    acceptance_start: subsidy.acceptance_start_datetime,
    acceptance_end: subsidy.acceptance_end_datetime,
    target: {
      area: subsidy.target_area_search,
      industry: subsidy.target_industry,
      employees: subsidy.target_number_of_employees,
      purpose: subsidy.use_purpose,
    },
    application_url: subsidy.inquiry_url,
    last_updated: subsidy.update_datetime,
    status,
  };

  // Save files
  const filesData: any = {
    application_guidelines: subsidy.application_guidelines || [],
    outline_of_grant: subsidy.outline_of_grant || [],
    application_form: subsidy.application_form || [],
  };

  const subsidyDir = path.join(FILES_DIR, subsidy_id);
  await fs.mkdir(subsidyDir, { recursive: true });

  const savedFiles: any = {};
  const fileTypeNames: Record<string, string> = {
    application_guidelines: '申請ガイドライン',
    outline_of_grant: '補助金概要',
    application_form: '申請書',
  };

  for (const [fileType, fileList] of Object.entries(filesData)) {
    if (Array.isArray(fileList) && fileList.length > 0) {
      savedFiles[fileType] = [];
      const baseName = fileTypeNames[fileType];

      for (let idx = 0; idx < fileList.length; idx++) {
        const fileData = fileList[idx];
        if (typeof fileData === 'object') {
          const fileName = fileData.name || fileData.file_name || `${baseName}_${idx + 1}.pdf`;
          const fileBase64 = fileData.data || fileData.file_data || '';

          if (fileBase64) {
            try {
              // Validate BASE64 data
              if (typeof fileBase64 !== 'string' || fileBase64.trim().length === 0) {
                throw new Error('無効なBASE64データ');
              }

              // Sanitize filename
              const safeFileName = fileName.replace(/[<>:"|?*\\/]/g, '_').replace(/\s/g, '_') || `${baseName}_${idx + 1}.pdf`;

              // Decode BASE64
              const fileContent = Buffer.from(fileBase64.trim(), 'base64');

              if (fileContent.length === 0) {
                throw new Error('デコード後のファイルが空です');
              }

              const filePath = path.join(subsidyDir, safeFileName);
              await fs.writeFile(filePath, fileContent);

              savedFiles[fileType].push({
                name: safeFileName,
                original_name: fileName,
                size: fileContent.length,
                mcp_access: {
                  tool: 'get_file_content',
                  params: {
                    subsidy_id,
                    filename: safeFileName,
                  },
                  description: 'このファイルにアクセスするには get_file_content ツールを使用してください',
                },
              });
            } catch (e: any) {
              savedFiles[fileType].push({
                name: fileName,
                error: `保存失敗 (${fileName}): ${e.message}`,
              });
            }
          }
        }
      }
    }
  }

  formattedResult.files = savedFiles;
  formattedResult.save_directory = subsidyDir;

  return formattedResult;
}

// Tool: get_file_content
async function getFileContent(args: any): Promise<any> {
  const { subsidy_id, filename, return_format = 'markdown' } = args;

  try {
    const filePath = path.join(FILES_DIR, subsidy_id, filename);

    try {
      await fs.access(filePath);
    } catch (e) {
      return { error: `ファイルが見つかりません: ${subsidy_id}/${filename}` };
    }

    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Determine MIME type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // Try to convert to Markdown if requested
    if (return_format === 'markdown') {
      try {
        let markdown = '';

        if (ext === '.pdf') {
          const dataBuffer = await fs.readFile(filePath);
          const pdfData = await pdfParse(dataBuffer);
          markdown = pdfData.text;
        } else if (ext === '.docx') {
          const result = await mammoth.extractRawText({ path: filePath });
          markdown = result.value;
        } else if (ext === '.xlsx' || ext === '.xls') {
          const workbook = XLSX.readFile(filePath);
          const sheets: string[] = [];
          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            sheets.push(`## ${sheetName}\n\n${csv}`);
          });
          markdown = sheets.join('\n\n---\n\n');
        } else if (mimeType.startsWith('text/')) {
          markdown = await fs.readFile(filePath, 'utf-8');
        }

        if (markdown && markdown.trim()) {
          return {
            filename,
            content_markdown: markdown,
            mime_type: mimeType,
            size_bytes: fileSize,
            extraction_method: `nodejs_${ext.slice(1)}`,
          };
        }
      } catch (e) {
        // Fall back to base64
      }
    }

    // Return as BASE64
    const content = await fs.readFile(filePath);
    const contentBase64 = content.toString('base64');

    return {
      filename,
      content_base64: contentBase64,
      mime_type: mimeType,
      size_bytes: content.length,
      data_uri: `data:${mimeType};base64,${contentBase64.slice(0, 100)}${contentBase64.length > 100 ? '...' : ''}`,
    };
  } catch (e: any) {
    return { error: `ファイル読み込みエラー: ${e.message}` };
  }
}

// Initialize MCP Server
const server = new Server(
  {
    name: 'jgrants-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_subsidies',
        description: `高度な検索条件で補助金を検索します。

このツールは jGrants 公開APIの "補助金検索" をラップしています。
- jGrants ポータル: https://www.jgrants-portal.go.jp/
- ベースURL: https://api.jgrants-portal.go.jp/exp/v1/public
- エンドポイント: GET /subsidies
- 公式ドキュメント: https://developers.digital.go.jp/documents/jgrants/api/

出典表示: 本ツールで取得した情報を利用・公開する際は、「Jグランツ（jGrants）からの出典」である旨を明記してください。`,
        inputSchema: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: '検索キーワード（2〜255文字、必須）',
            },
            use_purpose: {
              type: 'string',
              description: '利用目的（オプション）',
            },
            industry: {
              type: 'string',
              description: '業種（オプション）',
            },
            target_number_of_employees: {
              type: 'string',
              description: '従業員数制約（オプション）',
            },
            target_area_search: {
              type: 'string',
              description: '対象地域（オプション）',
            },
            sort: {
              type: 'string',
              description: 'ソート順フィールド',
              enum: ['created_date', 'acceptance_start_datetime', 'acceptance_end_datetime'],
              default: 'acceptance_end_datetime',
            },
            order: {
              type: 'string',
              description: 'ソート順',
              enum: ['ASC', 'DESC'],
              default: 'ASC',
            },
            acceptance: {
              type: 'number',
              description: '受付期間フィルタ（0=しない, 1=する）',
              enum: [0, 1],
              default: 1,
            },
          },
          required: ['keyword'],
        },
      },
      {
        name: 'get_subsidy_detail',
        description: `補助金の詳細情報を取得し、添付ファイルを自動的にダウンロードします。

このツールは jGrants 公開APIの "補助金詳細" をラップしています。
- ベースURL: https://api.jgrants-portal.go.jp/exp/v1/public
- エンドポイント: GET /subsidies/id/{subsidy_id}

出典表示: 本ツールで取得した情報を利用・公開する際は、「Jグランツ（jGrants）からの出典」である旨を明記してください。`,
        inputSchema: {
          type: 'object',
          properties: {
            subsidy_id: {
              type: 'string',
              description: '補助金ID（必須）',
            },
          },
          required: ['subsidy_id'],
        },
      },
      {
        name: 'get_subsidy_overview',
        description: `補助金の最新状況を把握します。締切期間別、金額規模別の集計を提供。

出典表示: 本ツールで取得した情報を利用・公開する際は、「Jグランツ（jGrants）からの出典」である旨を明記してください。`,
        inputSchema: {
          type: 'object',
          properties: {
            output_format: {
              type: 'string',
              description: '出力形式',
              enum: ['json', 'csv'],
              default: 'json',
            },
          },
        },
      },
      {
        name: 'get_file_content',
        description: `保存されたファイルの内容を取得（Markdown形式またはBASE64形式）

補助金詳細取得時に保存されたファイルをMCP経由で取得します。`,
        inputSchema: {
          type: 'object',
          properties: {
            subsidy_id: {
              type: 'string',
              description: '補助金ID（必須）',
            },
            filename: {
              type: 'string',
              description: 'ファイル名（必須）',
            },
            return_format: {
              type: 'string',
              description: '返却形式',
              enum: ['markdown', 'base64'],
              default: 'markdown',
            },
          },
          required: ['subsidy_id', 'filename'],
        },
      },
      {
        name: 'ping',
        description: 'サーバーの応答を確認するためのユーティリティ',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      case 'search_subsidies':
        result = await searchSubsidies(args || {});
        break;
      case 'get_subsidy_detail':
        result = await getSubsidyDetail(args || {});
        break;
      case 'get_subsidy_overview':
        result = await getSubsidyOverview(args || {});
        break;
      case 'get_file_content':
        result = await getFileContent(args || {});
        break;
      case 'ping':
        result = await ping();
        break;
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Register prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'subsidy_search_guide',
        description: '補助金検索のガイドとベストプラクティス',
      },
      {
        name: 'api_usage_agreement',
        description: 'jGrants API利用に関する同意事項',
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === 'subsidy_search_guide') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# jGrants補助金検索ガイド

## 検索時の注意事項
1. **キーワード選択**: 「補助金」「助成金」「事業」など複数のキーワードを試してください
2. **絞り込み条件**: 業種、従業員数、地域などで絞り込むと精度が向上します
3. **締切確認**: 募集終了日時を必ず確認してください

## データ利用時の重要事項
- 出典表示: 「Jグランツ（jGrants）からの出典」である旨を明記してください
- 最新情報: 詳細は公式サイト https://www.jgrants-portal.go.jp/ で確認してください
- API制限: 過度な連続アクセスは避けてください

## 推奨される使い方
1. まず広いキーワード（例: "事業"）で検索
2. 結果を確認して、必要に応じて絞り込み条件を追加
3. 気になる補助金の詳細をget_subsidy_detailで取得
4. PDFファイルがある場合はget_file_contentで内容確認`,
          },
        },
      ],
    };
  }

  if (name === 'api_usage_agreement') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# jGrants API 利用同意事項

## 以下の点にご同意いただけますか？

1. **出典表示義務**
   - 取得した情報を公開する際は「Jグランツ（jGrants）」からの出典である旨を明記します

2. **情報の確認**
   - 取得した情報は参考情報として扱い、正式な申請前に公式サイトで最新情報を確認します

3. **適切な利用**
   - APIへの過度な連続アクセスを避け、サーバーに負荷をかけないよう配慮します

4. **個人情報の取り扱い**
   - 補助金申請に関する個人情報や企業情報を適切に管理します

これらの条件に同意の上、補助金検索を開始してください。`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

// Register resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'jgrants://guidelines',
        name: 'jGrants MCP サーバー利用ガイドライン',
        description: '利用ガイドライン、API制限、トラブルシューティング',
        mimeType: 'text/plain',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'jgrants://guidelines') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `jGrants MCP サーバー利用ガイドライン

【重要な注意事項】
- 本サーバーはjGrants公開APIを使用しています
- 取得した情報の出典表示は必須です
- 正式な申請前に必ず公式サイトで最新情報を確認してください

【推奨される検索パターン】
1. 広いキーワードから始める: search_subsidies(keyword="事業")
2. 条件を追加して絞り込む: industry, target_area_search等を指定
3. 統計情報を確認: get_subsidy_overview()
4. 詳細情報を取得: get_subsidy_detail(subsidy_id)

【API制限について】
- 連続的な大量アクセスは避けてください
- エラーが発生した場合は時間を置いて再試行してください`,
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('jGrants MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
