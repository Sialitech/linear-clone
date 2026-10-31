import { createSign } from "node:crypto";

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

/** Short-lived RS256 JWT used to authenticate as the product GitHub App. */
export function signGithubAppJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: appId,
    }),
  );
  const data = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(data).sign(privateKeyPem).toString("base64url");
  return `${data}.${signature}`;
}
