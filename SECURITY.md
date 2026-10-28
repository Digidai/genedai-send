# Security

Do not report vulnerabilities with credentials, recipient data or email content in public issues. Use GitHub private vulnerability reporting where available, or contact the maintainer privately before sharing a reproduction.

This first release is a single-owner self-hosted application. It does not provide tenant isolation, public signup, billing, a public relay, or untrusted-user access. Do not expose the owner key or server-side API keys in browser bundles. Configure provider webhook signing before depending on delivery callbacks. Back up Worker secrets, D1 and R2; retention is operator-managed.
