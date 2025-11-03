# Security Policy

## Known Vulnerabilities

### xlsx Dependency

The `xlsx` package (version 0.18.5) has known security vulnerabilities:

1. **Prototype Pollution** (GHSA-4r6h-8v6p-xvw6)
2. **Regular Expression Denial of Service (ReDoS)** (GHSA-5pgg-2g8v-p4x9)

**Status**: No fix available as of the latest npm package version.

**Mitigation**: 
- The xlsx library is only used to convert Excel files downloaded from the trusted jGrants API
- Files are processed locally and not from untrusted user input
- Excel conversion is a convenience feature for reading downloaded subsidy documents
- The risk is considered acceptable given the controlled usage context

**Alternative**: If this vulnerability is unacceptable for your use case, you can:
1. Avoid using the `get_file_content` tool with Excel files
2. Manually convert Excel files to CSV before processing
3. Fork and remove xlsx dependency (Excel files will not be converted to Markdown)

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by:

1. Opening a GitHub Security Advisory
2. Or emailing the repository maintainer

Please do not open public issues for security vulnerabilities.

## Security Best Practices

When using this MCP server:

1. **API Keys**: Never commit API keys or secrets to the repository
2. **File Storage**: Regularly clean the `tmp/` directory where downloaded files are stored
3. **Network Access**: Be aware that this server makes external requests to the jGrants API
4. **Dependencies**: Run `npm audit` regularly and update dependencies when security patches are available
5. **Environment Variables**: Use `.env` files or environment variables for configuration, not hardcoded values

## Updates

We monitor security advisories for all dependencies and will update them when patches become available.
