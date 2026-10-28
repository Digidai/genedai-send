export function previewDoc(html: string) {
  const inert = html
    .replace(/<(?:meta|base)\b[^>]*>/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>a{pointer-events:none}</style>${inert}`;
}
