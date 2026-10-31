import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { signGithubAppJwt } from "../convex/lib/githubJwt.ts";
import {
  buildGithubManifest,
  clearOAuthStateCookie,
  githubAppDisplayName,
  githubAuthorizeUrl,
  githubInstallUrl,
  GITHUB_OAUTH_STATE_COOKIE,
  normalizeReturnOrigin,
  oauthStateCookie,
  parseGithubTokenBody,
  parseGithubUser,
  parseManifestApp,
  parsePullRequestUrl,
  readCookie,
  settingsLocation,
} from "../convex/lib/github.ts";

describe("github connect helpers", () => {
  it("accepts app and local origins only", () => {
    assert.equal(normalizeReturnOrigin("https://preview.example.com"), "https://preview.example.com");
    assert.equal(normalizeReturnOrigin("http://localhost:3000"), "http://localhost:3000");
    assert.equal(normalizeReturnOrigin("https://evil.example/phish"), null);
    assert.equal(normalizeReturnOrigin("http://example.com"), null);
    assert.equal(normalizeReturnOrigin("javascript:alert(1)"), null);
  });

  it("keeps generated GitHub app names within GitHub's limit", () => {
    const name = githubAppDisplayName("Equipo de producto ñ", "abc123xyz");
    assert.ok(name.length <= 34);
    assert.match(name, /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/);
    assert.ok(name.endsWith("abc1"));
    const longName = githubAppDisplayName("A".repeat(80), "zzzz");
    assert.equal(longName.length, 34);
    assert.ok(longName.endsWith("zzzz"));
  });

  it("builds a manifest that registers callbacks and does not embed secrets", () => {
    const manifest = buildGithubManifest({
      name: "Issues abcd",
      homepage: "https://app.example.com",
      convexSite: "https://happy-animal-123.convex.site/",
    });
    assert.equal(manifest.redirect_url, "https://happy-animal-123.convex.site/github/register/callback");
    assert.equal(manifest.setup_url, "https://happy-animal-123.convex.site/github/setup");
    assert.equal(manifest.setup_on_update, true);
    assert.equal(manifest.public, true);
    assert.deepEqual(manifest.callback_urls, ["https://happy-animal-123.convex.site/github/oauth/callback"]);
    assert.equal(manifest.default_permissions.pull_requests, "read");
    assert.equal(manifest.hook_attributes.active, false);
    assert.equal(manifest.request_oauth_on_install, false);
    const serialized = JSON.stringify(manifest);
    assert.equal(serialized.includes("client_secret"), false);
    assert.equal(serialized.includes("pem"), false);
  });

  it("uses repo scope only for a shared OAuth app", () => {
    const oauth = new URL(
      githubAuthorizeUrl({
        clientId: "Iv1.abc",
        redirectUri: "https://happy-animal-123.convex.site/github/oauth/callback",
        state: "state1",
        mode: "oauth_app",
      }),
    );
    assert.equal(oauth.searchParams.get("scope"), "repo read:user");
    const app = new URL(
      githubAuthorizeUrl({
        clientId: "Iv1.abc",
        redirectUri: "https://happy-animal-123.convex.site/github/oauth/callback",
        state: "state1",
        mode: "github_app",
      }),
    );
    assert.equal(app.searchParams.get("scope"), "offline_access");
    assert.equal(
      githubInstallUrl("issues-abcd", "state 1"),
      "https://github.com/apps/issues-abcd/installations/new?state=state+1",
    );
  });

  it("parses tokens, users, and manifest credentials", () => {
    const token = parseGithubTokenBody(
      { access_token: "ghu_token", refresh_token: "ghr_token", expires_in: 28800 },
      1_000,
    );
    assert.deepEqual(token, {
      accessToken: "ghu_token",
      refreshToken: "ghr_token",
      expiresAt: 1_000 + 28800 * 1000,
    });
    assert.equal(parseGithubTokenBody({ access_token: "gho_token" }, 1_000)?.expiresAt, null);
    assert.equal(parseGithubTokenBody({ error: "bad_verification_code" }, 1_000), null);
    assert.deepEqual(parseGithubUser({ id: 42, login: "octocat" }), { id: "42", login: "octocat" });
    assert.equal(parseGithubUser({ id: "nope" }), null);
    const created = parseManifestApp({
      id: 9,
      slug: "issues-abcd",
      name: "Issues abcd",
      client_id: "Iv1.client",
      client_secret: "secret",
      pem: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
      webhook_secret: "hook",
    });
    assert.equal(created?.slug, "issues-abcd");
    assert.equal(created?.clientSecret, "secret");
    assert.equal(parseManifestApp({ id: 9, slug: "x" }), null);
  });

  it("round-trips the oauth state cookie and settings redirect", () => {
    const cookie = oauthStateCookie("abc");
    assert.equal(readCookie(cookie, GITHUB_OAUTH_STATE_COOKIE), "abc");
    assert.match(clearOAuthStateCookie(), /Max-Age=0/);
    assert.equal(
      settingsLocation("https://app.example.com", "connected"),
      "https://app.example.com/settings?github=connected",
    );
    assert.equal(settingsLocation("https://app.example.com/extra", "connected"), null);
    assert.equal(settingsLocation("https://app.example.com", "javascript"), "https://app.example.com/settings?github=error");
  });

  it("signs a GitHub app JWT with RS256", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const pub = publicKey.export({ type: "pkcs1", format: "pem" }).toString();
    const now = 1_700_000_000;
    const jwt = signGithubAppJwt("12345", pem, now);
    const [header, payload, signature] = jwt.split(".");
    assert.ok(header && payload && signature);
    const headerJson = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg: string };
    const payloadJson = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      iss: string;
      iat: number;
      exp: number;
    };
    assert.equal(headerJson.alg, "RS256");
    assert.equal(payloadJson.iss, "12345");
    assert.equal(payloadJson.iat, now - 60);
    assert.equal(payloadJson.exp, now + 9 * 60);
    const valid = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(pub, Buffer.from(signature, "base64url"));
    assert.equal(valid, true);
  });

  it("parses pull request urls", () => {
    assert.equal(
      parsePullRequestUrl("https://github.com/acme/app/pull/12")?.url,
      "https://github.com/acme/app/pull/12",
    );
    assert.equal(parsePullRequestUrl("https://gitlab.com/acme/app/pull/12"), null);
  });
});
