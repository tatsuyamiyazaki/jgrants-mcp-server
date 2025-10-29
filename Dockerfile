# Python 3.11以上を使用
FROM python:3.11-slim

# 作業ディレクトリの設定
WORKDIR /app

# システムパッケージのアップデートと必要なパッケージのインストール
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 依存関係ファイルをコピー
COPY requirements.txt .

# Python依存パッケージのインストール
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY jgrants_mcp_server/ ./jgrants_mcp_server/

# ファイル保存用ディレクトリの作成
RUN mkdir -p /app/jgrants_files

# 環境変数の設定
ENV JGRANTS_FILES_DIR=/app/jgrants_files \
    API_BASE_URL=https://api.jgrants-portal.go.jp/exp/v1/public \
    PYTHONUNBUFFERED=1

# ポート8080を公開
EXPOSE 8080

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8080/mcp')" || exit 1

# サーバー起動コマンド
CMD ["python", "-m", "jgrants_mcp_server.core", "--host", "0.0.0.0", "--port", "8080"]
