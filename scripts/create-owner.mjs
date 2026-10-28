import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
const dir = new URL("../secrets/", import.meta.url);
await mkdir(dir, { recursive: true });
try {
  await access(new URL("deployment.json", dir));
  console.log(
    "Existing credentials preserved. Use secrets/workspace-access.md.",
  );
  process.exit(0);
} catch {}
const key = "gs_admin_" + randomBytes(36).toString("base64url");
const credentials = {
  key,
  hash: createHash("sha256").update(key).digest("hex"),
  session_secret: randomBytes(48).toString("base64url"),
};
await writeFile(
  new URL("deployment.json", dir),
  JSON.stringify(credentials, null, 2) + "\n",
  { mode: 0o600, flag: "wx" },
);
await writeFile(
  new URL("workspace-access.md", dir),
  "# Private GeneSend owner access\n\nEnter this key in the Open workspace dialog:\n\n`" +
    key +
    "`\n\nNever commit or share this file.\n",
  { mode: 0o600, flag: "wx" },
);
await writeFile(
  new URL("../.dev.vars", import.meta.url),
  `ADMIN_KEY_HASH="${credentials.hash}"\nSESSION_SECRET="${credentials.session_secret}"\nDEV_ORIGIN="http://127.0.0.1:5173"\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Private credentials generated. Read secrets/workspace-access.md locally. No secrets printed.",
);
