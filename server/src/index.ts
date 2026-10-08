import cors from "cors";
import axios from "axios";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createLogger, format, transports } from "winston";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";

type RunMetrics = {
  activeUsers: number;
  totalRequests: number;
  success: number;
  failed: number;
  tps: number;
  avgResponse: number;
  activeTests: number;
  p95: number;
  peakResponse: number;
  peakTps: number;
  status: string;
};
const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "logs/wiser-load.log" }),
  ],
});
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: true } });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});
app.use(cors());
app.use(express.json({ limit: "2mb" }));
let metrics: RunMetrics = {
  activeUsers: 0,
  totalRequests: 0,
  success: 0,
  failed: 0,
  tps: 0,
  avgResponse: 0,
  activeTests: 0,
  p95: 0,
  peakResponse: 0,
  peakTps: 0,
  status: "Idle",
};
type CapturedResponse = {
  id: string;
  timestamp: string;
  api: string;
  user: string;
  method: string;
  statusCode: number;
  responseTime: number;
  setupTime: number;
  totalTime: number;
  result: "Success" | "Failure";
  request: { url: string; body?: unknown };
  response: unknown;
};
const capturedResponses: CapturedResponse[] = [];
type ImportedUser = { email_id: string; password: string; app_token: string };
const importedUsers: ImportedUser[] = [];
const activeRuns = new Map<string, string>();
const responseTimes: number[] = [];
let responseTimeTotal = 0;
const completionTimes: number[] = [];
const recentRuns: { id: string; api: string; mode: string; requests: number; result: string; timestamp: string }[] = [];
const activity: { timestamp: string; message: string }[] = [];
const trend: { timestamp: string; response: number; tps: number; cpu: number; memory: number }[] = [];
let previousCpu = process.cpuUsage();
let previousSample = performance.now();
const recordActivity = (message: string) => {
  activity.unshift({ timestamp: new Date().toISOString(), message });
  activity.splice(20);
};
const updateActiveMetrics = () => {
  metrics.activeTests = activeRuns.size;
  metrics.activeUsers = new Set(activeRuns.values()).size;
  io.emit("metrics", metrics);
};
const resolvePlaceholderValue = (key: string, user: ImportedUser, loginCode?: string, resources: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    email_id: user.email_id,
    password: user.password,
    app_token: user.app_token,
    code: process.env.WISER_USER_CODE || loginCode || "",
    verify_forgot_code:
      process.env.WISER_VERIFY_FORGOT_CODE || "",
    location_id: process.env.WISER_LOCATION_ID || "",
    loc_id: process.env.WISER_LOC_ID || "",
    room_id: process.env.WISER_ROOM_ID || "",
    guest_id: process.env.WISER_GUEST_ID || "",
    hub_id: process.env.WISER_HUB_ID || "",
    device_id: process.env.WISER_DEVICE_ID || "",
    setting_id: process.env.WISER_SETTING_ID || "",
    user_id: process.env.WISER_USER_ID || "",
    federated_id: process.env.WISER_FEDERATED_ID || "",
    msg_id: process.env.WISER_MSG_ID || "",
    action_reason: process.env.WISER_ACTION_REASON || "",
    site_id: process.env.WISER_SITE_ID || "",
    siteId: process.env.WISER_SITE_ID || "",
    roomId: process.env.WISER_ROOM_ID || "",
    deviceId: process.env.WISER_DEVICE_ID || "",
    superlocation_id: process.env.WISER_SUPERLOCATION_ID || "",
    id: process.env.WISER_SUPERLOCATION_ID || "",
    report_type: process.env.WISER_REPORT_TYPE || "daily",
    type: process.env.WISER_ENERGY_TYPE || "power",
    client_id: process.env.WISER_CLIENT_ID || "",
    client_secret: process.env.WISER_CLIENT_SECRET || "",
  };
  return values[key] || resources[key] || `{${key}}`;
};
const resolveUserTemplate = (value: unknown, user: ImportedUser, loginCode?: string, resources: Record<string, string> = {}): unknown => {
  if (typeof value === "string")
    return value.replace(
      /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_match, key: string) => resolvePlaceholderValue(key, user, loginCode, resources),
    );
  if (Array.isArray(value))
    return value.map((item) => resolveUserTemplate(item, user, loginCode, resources));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveUserTemplate(item, user, loginCode, resources),
      ]),
    );
  return value;
};
const resolveTargetUrl = (value: string, user: ImportedUser, loginCode?: string, resources: Record<string, string> = {}) =>
  value.replace(
    /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_match, key: string) => {
      const resolved = resolvePlaceholderValue(key, user, loginCode, resources);
      return resolved === `{${key}}` ? resolved : encodeURIComponent(resolved);
    },
  );
const templateKeys = (value: unknown): string[] => {
  if (typeof value === "string")
    return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
  if (Array.isArray(value)) return value.flatMap(templateKeys);
  if (value && typeof value === "object") return Object.values(value).flatMap(templateKeys);
  return [];
};
const findResourceValue = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    if (typeof candidate === "number") return String(candidate);
  }
  for (const item of Object.values(value)) {
    const candidate = findResourceValue(item, key);
    if (candidate) return candidate;
  }
  return undefined;
};
setInterval(() => {
  const now = Date.now();
  while (completionTimes.length && completionTimes[0] <= now - 1000) completionTimes.shift();
  metrics.tps = completionTimes.length;
  metrics.peakTps = Math.max(metrics.peakTps, metrics.tps);
  const currentSample = performance.now();
  const cpuUsage = process.cpuUsage(previousCpu);
  previousCpu = process.cpuUsage();
  const cpu = Math.round(((cpuUsage.user + cpuUsage.system) / ((currentSample - previousSample) * 1000)) * 1000) / 10;
  previousSample = currentSample;
  trend.push({ timestamp: new Date().toISOString(), response: metrics.avgResponse, tps: metrics.tps, cpu, memory: Math.round(process.memoryUsage().rss / 1024 / 1024) });
  trend.splice(0, Math.max(0, trend.length - 60));
  io.emit("metrics", metrics);
}, 1000);
app.get("/api/dashboard", (_request, response) => response.json({
  metrics,
  usersLoaded: importedUsers.length,
  recentRuns,
  activity,
  trend,
  utilization: { cpu: trend.at(-1)?.cpu ?? 0, memory: Math.round(process.memoryUsage().rss / 1024 / 1024) },
}));
app.get("/api/health", (_request, response) =>
  response.json({ status: "healthy", engine: "k6-adapter", metrics }),
);
app.post("/api/auth/login", (request, response) => {
  const token = jwt.sign(
    { sub: request.body.email || "operator", role: "tester" },
    process.env.JWT_SECRET || "development-only-secret",
    { expiresIn: "8h" },
  );
  response.json({ token, user: { email: request.body.email, role: "tester" } });
});
app.post("/api/reports/analytics/email", (_request, response) => {
  if (process.platform !== "win32")
    return response
      .status(501)
      .json({
        error: "Outlook desktop automation is available only on Windows.",
      });

  const methodTotals = capturedResponses.reduce(
    (totals, item) => {
      const method = item.method?.toUpperCase();
      if (method === "GET" || method === "PUT" || method === "PATCH")
        totals[method] += 1;
      return totals;
    },
    { GET: 0, PUT: 0, PATCH: 0 },
  );
  const totalUsers = importedUsers.length;
  const totalExecution = Math.max(metrics.totalRequests, capturedResponses.length);
  const successRate = totalExecution
    ? `${((metrics.success / totalExecution) * 100).toFixed(2)}%`
    : "0.00%";
  const failureRate = totalExecution
    ? `${((metrics.failed / totalExecution) * 100).toFixed(2)}%`
    : "0.00%";
  const emailBody = [
    "Hi Team,",
    "URL - https://api.wiser-support.se.app",
    `Total API: GET - ${methodTotals.GET} Put - ${methodTotals.PUT} Patch - ${methodTotals.PATCH}`,
    `Total users- ${totalUsers}`,
    `Success rate- ${successRate}`,
    `Failuer rate - ${failureRate}`,
    "Thanks",
  ].join("\r\n");
  const emailSubject = "Load testinng for wiser inida";
  const encodedSubject = Buffer.from(emailSubject, "utf16le").toString("base64");
  const encodedBody = Buffer.from(emailBody, "utf16le").toString("base64");

  const script = [
    "$outlook = New-Object -ComObject Outlook.Application",
    "$mail = $outlook.CreateItem(0)",
    "$mail.To = 'sesa528360@se.com'",
    `$mail.Subject = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedSubject}'))`,
    `$mail.Body = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedBody}'))`,
    "$mail.Send()",
  ].join("; ");

  execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    (error) => {
      if (error) {
        logger.error("Outlook analytics email failed", {
          error: error.message,
        });
        return response
          .status(500)
          .json({
            error:
              "Outlook could not send the analytics email. Ensure Outlook desktop is signed in and running.",
          });
      }
      logger.info("Analytics email sent through Outlook", {
        recipient: "sesa528360@se.com",
      });
      response.json({ message: "Analytics report sent to sesa528360@se.com." });
    },
  );
});
const isSuccessfulResponse = (statusCode: number, payload: unknown) => {
  if (statusCode < 200 || statusCode >= 400) return false;
  if (!payload || typeof payload !== "object") return true;
  if ((payload as { status?: unknown }).status === 0 || "error" in payload) return false;
  const message =
    (payload as { message?: unknown; detail?: unknown }).message ??
    (payload as { detail?: unknown }).detail;
  return (
    typeof message !== "string" || !/unauthorized|forbidden/i.test(message)
  );
};
const parseResponseBody = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};
const isWiserApi = (targetUrl: string) =>
  targetUrl.startsWith("https://api.wiser-support.se.app/v1/");
type WiserSession = {
  configuration: string;
  code: string;
  accessToken: string;
  expiresAt: number;
  lookups: Map<string, { data: unknown; expiresAt: number }>;
  pendingLookups: Map<string, Promise<unknown>>;
};
const wiserSessions = new WeakMap<ImportedUser, WiserSession>();
type WiserAuthentication = {
  login: { status: number; data: string };
  token?: { status: number; data: string };
};
const pendingWiserAuthentication = new WeakMap<ImportedUser, {
  configuration: string;
  promise: Promise<WiserAuthentication>;
}>();
const authenticateWiser = (
  credential: ImportedUser,
  authorization: string,
  configuration: string,
  clientId: string,
  clientSecret: string,
  onTokenStart?: () => void,
): Promise<WiserAuthentication> => {
  const pending = pendingWiserAuthentication.get(credential);
  if (!onTokenStart && pending?.configuration === configuration) return pending.promise;
  const promise = (async (): Promise<WiserAuthentication> => {
    const login = await axios({
      url: "https://api.wiser-support.se.app/v1/user/login",
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      data: credential,
      responseType: "text",
      timeout: 10000,
      validateStatus: () => true,
    });
    const loginPayload = parseResponseBody(login.data) as { code?: string };
    if (!isSuccessfulResponse(login.status, loginPayload) || !loginPayload.code) return { login };
    onTokenStart?.();
    const token = await axios({
      url: "https://api.wiser-support.se.app/v1/oauth/token",
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        code: loginPayload.code,
        grant_type: "code",
        client_id: clientId,
        client_secret: clientSecret,
      },
      responseType: "text",
      timeout: 10000,
      validateStatus: () => true,
    });
    return { login, token };
  })();
  if (!onTokenStart) {
    const entry = { configuration, promise };
    pendingWiserAuthentication.set(credential, entry);
    const cleanup = () => {
      if (pendingWiserAuthentication.get(credential) === entry)
        pendingWiserAuthentication.delete(credential);
    };
    void promise.then(cleanup, cleanup);
  }
  return promise;
};
const isAuthorizationFailure = (statusCode: number, payload: unknown) => {
  if (statusCode === 401 || statusCode === 403) return true;
  if (!payload || typeof payload !== "object") return false;
  const message = (payload as { message?: unknown; detail?: unknown }).message ??
    (payload as { detail?: unknown }).detail;
  return typeof message === "string" && /unauthorized|forbidden|(?:invalid|expired).*token|token.*(?:invalid|expired)/i.test(message);
};
app.post("/api/runs", async (request, response) => {
  const id = `LT-${new Date().getFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const users = Math.min(Number(request.body.virtualUsers) || 1, 5000);
  const targetUrl = request.body.request?.url;
  const apiName = request.body.api || "Unnamed API";
  if (!targetUrl || !String(targetUrl).startsWith("https://"))
    return response
      .status(400)
      .json({ error: "An explicit HTTPS API endpoint is required." });
  if (!importedUsers.length)
    return response
      .status(400)
      .json({
        error: "Import a user credentials file before running this API.",
      });
  const targetPath = new URL(targetUrl).pathname;
  const isWiserLogin = isWiserApi(targetUrl) && targetPath === "/v1/user/login";
  const isWiserToken = isWiserApi(targetUrl) && targetPath === "/v1/oauth/token";
  const requiresWiserAuthentication =
    isWiserApi(targetUrl) && !isWiserLogin;
  const authorization =
    isWiserLogin || requiresWiserAuthentication
      ? process.env.WISER_LOGIN_AUTHORIZATION
      : undefined;
  if ((isWiserLogin || requiresWiserAuthentication) && !authorization)
    return response
      .status(500)
      .json({
        error: "Set WISER_LOGIN_AUTHORIZATION before running WISER APIs.",
      });
  const credential = importedUsers[0];
  const resolvedTargetUrl = resolveTargetUrl(targetUrl, credential);
  let requestBody = resolveUserTemplate(
    request.body.request?.body,
    credential,
  );
  activeRuns.set(id, credential.email_id);
  metrics.status = "Running";
  updateActiveMetrics();
  const startedAt = performance.now();
  let apiStartedAt: number | undefined;
  let statusCode = 0;
  let payload: unknown;
  let executedUrl = resolvedTargetUrl;
  let activeSession: WiserSession | undefined;
  try {
    if (requiresWiserAuthentication) {
      const loginAuthorization = authorization!;
      const configuration = JSON.stringify([
        loginAuthorization, process.env.WISER_CLIENT_ID, process.env.WISER_CLIENT_SECRET,
      ]);
      const cachedSession = wiserSessions.get(credential);
      if (!isWiserToken && cachedSession?.configuration === configuration && cachedSession.expiresAt > Date.now())
        activeSession = cachedSession;
      else
        wiserSessions.delete(credential);
      const decodedAuthorization = Buffer.from(
        loginAuthorization.replace(/^Basic\s+/i, ""),
        "base64",
      ).toString("utf8");
      const separator = decodedAuthorization.indexOf(":");
      const clientId = process.env.WISER_CLIENT_ID || decodedAuthorization.slice(0, separator);
      const clientSecret = process.env.WISER_CLIENT_SECRET || decodedAuthorization.slice(separator + 1);
      if (separator < 1 && (!process.env.WISER_CLIENT_ID || !process.env.WISER_CLIENT_SECRET))
        throw new Error("Configure WISER_CLIENT_ID and WISER_CLIENT_SECRET or a valid Basic WISER_LOGIN_AUTHORIZATION.");
      const authentication = activeSession ? undefined : await authenticateWiser(
        credential, loginAuthorization, configuration, clientId, clientSecret,
        isWiserToken ? () => { apiStartedAt = performance.now(); } : undefined,
      );
      const login = activeSession
        ? { status: 200, data: JSON.stringify({ status: 1, code: activeSession.code }) }
        : authentication!.login;
      const loginPayload = parseResponseBody(login.data) as { code?: string };
      if (!isSuccessfulResponse(login.status, loginPayload) || !loginPayload.code) {
        statusCode = login.status;
        payload = { error: "Login did not return an authorization code.", login: loginPayload };
      } else {
        const token = activeSession
          ? { status: 200, data: JSON.stringify({ access_token: activeSession.accessToken }) }
          : authentication!.token!;
        const tokenPayload = parseResponseBody(token.data) as { access_token?: string; expires_in?: number | string };
        if (!isSuccessfulResponse(token.status, tokenPayload) || !tokenPayload.access_token) {
          statusCode = token.status;
          payload = { error: "OAuth token exchange failed.", token: tokenPayload };
        } else if (isWiserToken) {
          statusCode = token.status;
          payload = tokenPayload;
          requestBody = undefined;
        } else {
          if (!activeSession) {
            const expiresIn = Number(tokenPayload.expires_in);
            const lifetime = Number.isFinite(expiresIn) && expiresIn >= 0
              ? Math.min(60000, Math.max(0, expiresIn * 1000 - 5000))
              : 60000;
            const sharedSession = wiserSessions.get(credential);
            activeSession = sharedSession?.configuration === configuration &&
              sharedSession.accessToken === tokenPayload.access_token && sharedSession.expiresAt > Date.now()
              ? sharedSession : {
              configuration,
              code: loginPayload.code,
              accessToken: tokenPayload.access_token,
              expiresAt: Date.now() + lifetime,
              lookups: new Map(),
              pendingLookups: new Map(),
            };
            wiserSessions.set(credential, activeSession);
          }
          const authHeaders = {
            "content-type": "application/json",
            accept: "application/json",
            client_id: clientId,
            client_secret: clientSecret,
            access_token: tokenPayload.access_token,
          };
          const resources: Record<string, string> = { client_id: clientId, client_secret: clientSecret };
          const pendingKeys = () => templateKeys(resolveUserTemplate(request.body.request, credential, loginPayload.code, resources));
          const needs = (...keys: string[]) => pendingKeys().some((key) => keys.includes(key));
          if (/\/delete(?:\/|$)/.test(targetPath)) {
            const unconfiguredIds = templateKeys(request.body.request).filter(
              (key) => (/(?:id|Id)$/.test(key) || key === "code") &&
                resolvePlaceholderValue(key, credential) === `{${key}}`,
            );
            if (unconfiguredIds.length)
              throw new Error(`Deletion requires explicitly configured test IDs: ${[...new Set(unconfiguredIds)].join(", ")}. Automatic resource selection is disabled for delete endpoints.`);
          }
          const discover = async (path: string, mappings: Record<string, string>) => {
            const cached = activeSession!.lookups.get(path);
            let data: unknown;
            if (cached && cached.expiresAt > Date.now()) {
              data = cached.data;
            } else {
              let pendingLookup = activeSession!.pendingLookups.get(path);
              if (!pendingLookup) {
                pendingLookup = (async () => {
                  const lookup = await axios({
                    url: `https://api.wiser-support.se.app${path}`,
                    method: "GET",
                    headers: {
                      ...authHeaders,
                      ...(path.startsWith("/v1/location/device/") ? {
                        locationId: resolvePlaceholderValue("location_id", credential, loginPayload.code, resources),
                      } : {}),
                    },
                    responseType: "text",
                    timeout: 10000,
                    validateStatus: () => true,
                  });
                  const lookupData = parseResponseBody(lookup.data);
                  if (isAuthorizationFailure(lookup.status, lookupData)) wiserSessions.delete(credential);
                  if (!isSuccessfulResponse(lookup.status, lookupData))
                    throw new Error(`Resource lookup failed: ${path} (HTTP ${lookup.status}).`);
                  if (activeSession!.pendingLookups.get(path) === pendingLookup)
                    activeSession!.lookups.set(path, {
                      data: lookupData,
                      expiresAt: Math.min(activeSession!.expiresAt, Date.now() + 15000),
                    });
                  return lookupData;
                })();
                activeSession!.pendingLookups.set(path, pendingLookup);
              }
              try {
                data = await pendingLookup;
              } finally {
                if (activeSession!.pendingLookups.get(path) === pendingLookup)
                  activeSession!.pendingLookups.delete(path);
              }
            }
            for (const [placeholder, field] of Object.entries(mappings)) {
              const value = findResourceValue(data, field);
              if (value) resources[placeholder] = value;
            }
            return data;
          };
          if (needs("location_id", "room_id", "hub_id", "device_id", "deviceId", "roomId", "setting_id"))
            await discover("/v1/location/get", { location_id: "location_id" });
          if (needs("user_id"))
            await discover("/v1/user/details", { user_id: "user_id" });
          if (needs("loc_id"))
            await discover("/v1/location/super/get", { loc_id: "loc_id" });
          if (needs("guest_id"))
            await discover("/v1/user/getGuest", { guest_id: "guest_id" });
          if (needs("site_id", "siteId"))
            await discover("/v1/ex/sites", { site_id: "siteId", siteId: "siteId" });
          if (needs("superlocation_id", "id"))
            await discover("/v1/ex/locations", { superlocation_id: "locationId", id: "locationId" });
          const locationId = resolvePlaceholderValue("location_id", credential, loginPayload.code, resources);
          if (!locationId.startsWith("{") && needs("setting_id"))
            await discover(`/v1/location/${encodeURIComponent(locationId)}/settings`, { setting_id: "id" });
          if (!locationId.startsWith("{") && needs("room_id", "roomId"))
            await discover(`/v1/location/room/${encodeURIComponent(locationId)}/get`, { room_id: "room_id", roomId: "room_id" });
          if (!locationId.startsWith("{") && needs("hub_id", "device_id", "deviceId")) {
            const deviceResponse = await discover(`/v1/location/device/${encodeURIComponent(locationId)}/all`, {});
            const deviceData = (deviceResponse as { data?: unknown })?.data;
            const devices = Array.isArray(deviceData) ? deviceData
              : (deviceData as { devices?: unknown })?.devices;
            if (Array.isArray(devices)) {
              const requiresHub = templateKeys(request.body.request).includes("hub_id");
              const device = devices.find((item: unknown) => {
                if (!item || typeof item !== "object") return false;
                const record = item as Record<string, unknown>;
                return typeof record.device_id === "string" && record.device_id.length > 0 &&
                  (!requiresHub || (typeof record.hub_id === "string" && record.hub_id.length > 0)) &&
                  (!process.env.WISER_HUB_ID || record.hub_id === process.env.WISER_HUB_ID) &&
                  (!process.env.WISER_DEVICE_ID || record.device_id === process.env.WISER_DEVICE_ID);
              }) as { device_id: string; hub_id?: string } | undefined;
              if (device) {
                resources.device_id = device.device_id;
                resources.deviceId = device.device_id;
                if (device.hub_id) resources.hub_id = device.hub_id;
              } else if (process.env.WISER_HUB_ID || process.env.WISER_DEVICE_ID) {
                throw new Error("No device matching the configured hub/device IDs was found in the selected location.");
              }
            }
          }
          const missing = [...new Set(pendingKeys())];
          if (missing.length)
            throw new Error(`Missing test data: ${missing.join(", ")}. Configure the corresponding WISER environment variables or provide resources owned by the imported user.`);
          executedUrl = resolveTargetUrl(targetUrl, credential, loginPayload.code, resources);
          requestBody = resolveUserTemplate(request.body.request?.body, credential, loginPayload.code, resources);
          apiStartedAt = performance.now();
          const upstream = await axios({
            url: executedUrl,
            method: request.body.request?.method || "GET",
            headers: {
              ...(resolveUserTemplate(request.body.request?.headers, credential, loginPayload.code, resources) as Record<string, string> || {}),
              ...authHeaders,
            },
            data: requestBody,
            responseType: "text",
            timeout: 10000,
            validateStatus: () => true,
          });
          statusCode = upstream.status;
          payload = parseResponseBody(upstream.data);
        }
      }
    } else {
      apiStartedAt = performance.now();
      const upstream = await axios({
        url: resolvedTargetUrl,
        method: request.body.request?.method || "POST",
        headers: {
          "content-type": "application/json",
          ...(authorization ? { authorization } : {}),
          ...(request.body.request?.headers || {}),
        },
        data: requestBody,
        responseType: "text",
        timeout: 10000,
        validateStatus: () => true,
      });
      statusCode = upstream.status;
      payload = parseResponseBody(upstream.data);
    }
  } catch (error) {
    payload = {
      error: error instanceof Error ? error.message : "API request failed",
      detail:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : undefined,
    };
  }
  if (isWiserApi(targetUrl)) {
    const method = String(request.body.request?.method || "GET").toUpperCase();
    if (isAuthorizationFailure(statusCode, payload) || isWiserLogin ||
        /\/user\/(?:logout|password|change|delete|updateemail)(?:\/|$)/.test(targetPath) ||
        /\/user\/[^/]+\/password\/?$/.test(targetPath))
      wiserSessions.delete(credential);
    else if (method !== "GET" && method !== "HEAD") {
      activeSession?.lookups.clear();
      activeSession?.pendingLookups.clear();
    }
  }
  const finishedAt = performance.now();
  const totalTime = Math.round(finishedAt - startedAt);
  const responseTime = apiStartedAt === undefined ? 0 : Math.round(finishedAt - apiStartedAt);
  const captured: CapturedResponse = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    api: apiName,
    user: credential.email_id,
    method: request.body.request?.method || "POST",
    statusCode,
    responseTime,
    setupTime: Math.max(0, totalTime - responseTime),
    totalTime,
    result: isSuccessfulResponse(statusCode, payload) ? "Success" : "Failure",
    request: { url: executedUrl, body: requestBody },
    response: payload,
  };
  capturedResponses.unshift(captured);
  capturedResponses.splice(1000);
  activeRuns.delete(id);
  if (apiStartedAt !== undefined) {
    metrics.totalRequests += 1;
    if (captured.result === "Success") metrics.success += 1;
    else metrics.failed += 1;
    responseTimeTotal += responseTime;
    const position = responseTimes.findIndex((value) => value > responseTime);
    responseTimes.splice(position === -1 ? responseTimes.length : position, 0, responseTime);
    metrics.avgResponse = Math.round(responseTimeTotal / responseTimes.length);
    metrics.p95 = responseTimes[Math.max(0, Math.ceil(responseTimes.length * 0.95) - 1)];
    metrics.peakResponse = Math.max(metrics.peakResponse, responseTime);
    completionTimes.push(Date.now());
  }
  metrics.tps = completionTimes.filter((time) => time > Date.now() - 1000).length;
  metrics.peakTps = Math.max(metrics.peakTps, metrics.tps);
  metrics.status = activeRuns.size ? "Running" : "Completed";
  recentRuns.unshift({ id, api: apiName, mode: request.body.mode || "Single", requests: apiStartedAt === undefined ? 0 : 1, result: captured.result, timestamp: captured.timestamp });
  recentRuns.splice(20);
  recordActivity(`${apiName}: ${captured.result}${apiStartedAt === undefined ? " (not executed)" : ` in ${responseTime} ms`}`);
  updateActiveMetrics();
  logger.info("Load test run started", {
    id,
    api: captured.api,
    mode: request.body.mode,
    users,
    statusCode,
  });
  response
    .status(201)
    .json({ id, status: "Completed", metrics, response: captured });
});
app.get("/api/responses", (_request, response) =>
  response.json(capturedResponses),
);
app.post("/api/runs/:id/stop", (request, response) => {
  metrics = { ...metrics, activeUsers: 0, tps: 0, status: "Stopped" };
  logger.info("Load test run stopped", { id: request.params.id });
  response.json({ metrics });
});
app.post("/api/import/:kind", upload.single("file"), (request, response) => {
  if (!request.file)
    return response.status(400).json({ error: "A file is required." });
  const kind = request.params.kind;
  const fileName = request.file.originalname.toLowerCase();
  const accepted =
    kind === "jmeter"
      ? fileName.endsWith(".jmx")
      : /\.(csv|txt|xlsx)$/.test(fileName);
  if (!accepted)
    return response.status(415).json({ error: "Unsupported file format." });
  const text = request.file.buffer.toString("utf8");
  if (kind === "users") {
    const records = text
      .split(/\r?\n/)
      .map((line) => line.split(",").map((value) => value.trim()))
      .filter(
        (values) =>
          values.length >= 3 &&
          values[0] &&
          values[1] &&
          values[2] &&
          values[0].toLowerCase() !== "email_id",
      )
      .map(([email_id, password, app_token]) => ({
        email_id,
        password,
        app_token,
      }));
    const unique = records.filter(
      (record) =>
        !importedUsers.some((user) => user.email_id === record.email_id),
    );
    importedUsers.push(...unique);
    recordActivity(`Imported ${unique.length} user credentials.`);
    logger.info("Users imported", {
      file: request.file.originalname,
      count: unique.length,
    });
    return response.json({
      message: `${unique.length} user records accepted`,
      count: unique.length,
    });
  }
  const count = (text.match(/HTTPSamplerProxy/g) || []).length;
  logger.info("Import completed", {
    kind,
    file: request.file.originalname,
    count,
  });
  response.json({ message: `${count} HTTP samplers discovered`, count });
});
io.on("connection", (socket) => socket.emit("metrics", metrics));
server.listen(Number(process.env.PORT) || 3002, () =>
  logger.info("WISER API service listening on port 3002"),
);
