# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2025-11-03

### Added
- Complete Node.js/TypeScript implementation of jGrants MCP Server
- 5 MCP tools:
  - `search_subsidies`: Search for subsidies with advanced filters
  - `get_subsidy_detail`: Get detailed information and download attachments
  - `get_subsidy_overview`: Get statistical overview
  - `get_file_content`: Convert downloaded files to Markdown
  - `ping`: Health check endpoint
- 2 MCP prompts:
  - `subsidy_search_guide`: Best practices for searching
  - `api_usage_agreement`: API usage terms
- 1 MCP resource:
  - `jgrants://guidelines`: Server usage guidelines
- File conversion support:
  - PDF to Markdown (using pdf-parse)
  - Word documents to Markdown (using mammoth)
  - Excel spreadsheets to Markdown (using xlsx)
- HTTP client with error handling (using axios)
- Environment variable configuration support
- Integration test suite
- Comprehensive documentation:
  - README.md with setup instructions
  - SECURITY.md with security policy
  - USAGE_EXAMPLES.md with usage patterns
  - CHANGELOG.md (this file)

### Security
- Using axios 1.12.0 with SSRF and DoS vulnerability fixes
- Documented known xlsx vulnerabilities in SECURITY.md
- CodeQL security analysis passing with 0 alerts

### Technical Details
- TypeScript for type safety
- @modelcontextprotocol/sdk 1.0.4 for MCP protocol
- Stdio transport for Claude Desktop integration
- Automated build process with TypeScript compilation

### Reference
- Based on Python implementation: https://github.com/digital-go-jp/jgrants-mcp-server
- Maintains 100% feature parity with Python version
- Compatible with Claude Desktop v0.7.10+
- Requires Node.js 18+

## Links
- Repository: https://github.com/tatsuyamiyazaki/jgrants-mcp-server
- Reference Python version: https://github.com/digital-go-jp/jgrants-mcp-server
- jGrants Portal: https://www.jgrants-portal.go.jp/
- jGrants API Documentation: https://developers.digital.go.jp/documents/jgrants/api/
