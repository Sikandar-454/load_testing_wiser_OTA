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
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";

type RunMetrics = {
  activeUsers: number;
  totalRequests: number;
  success: number;
  failed: number;
  tps: number;
  avgResponse: number;
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
  totalRequests: 12840,
  success: 12638,
  failed: 202,
  tps: 0,
  avgResponse: 286,
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
  result: "Success" | "Failure";
  request: { url: string; body?: unknown };
  response: unknown;
};
const capturedResponses: CapturedResponse[] = [];
type ScheduledApi = {
  name: string;
  url: string;
  method: string;
  body?: unknown;
};
type SuiteSchedule = {
  id: string;
  startsAt: string;
  runsCompleted: number;
  totalRuns: number;
  status: "Scheduled" | "Running" | "Complete" | "Cancelled";
};
let suiteSchedule: SuiteSchedule | null = null;
let scheduledSuiteTimer: NodeJS.Timeout | null = null;
type ImportedUser = { email_id: string; password: string; app_token: string };
const importedUsers: ImportedUser[] = [];
const importedJmeterApis: string[] = [];
const resolvePlaceholderValue = (key: string, user: ImportedUser) => {
  const values: Record<string, string> = {
    email_id: user.email_id,
    password: user.password,
    app_token: user.app_token,
    code: process.env.WISER_USER_CODE || "demo-user-code",
    verify_forgot_code:
      process.env.WISER_VERIFY_FORGOT_CODE || "demo-verify-forgot-code",
    location_id: process.env.WISER_LOCATION_ID || "demo-location-id",
    loc_id: process.env.WISER_LOC_ID || "demo-loc-id",
    room_id: process.env.WISER_ROOM_ID || "demo-room-id",
    guest_id: process.env.WISER_GUEST_ID || "demo-guest-id",
    hub_id: process.env.WISER_HUB_ID || "demo-hub-id",
    device_id: process.env.WISER_DEVICE_ID || "demo-device-id",
    setting_id: process.env.WISER_SETTING_ID || "demo-setting-id",
    report_type: process.env.WISER_REPORT_TYPE || "daily",
    type: process.env.WISER_ENERGY_TYPE || "power",
    client_id: process.env.WISER_CLIENT_ID || "demo-client-id",
    client_secret: process.env.WISER_CLIENT_SECRET || "demo-client-secret",
  };
  return values[key] ?? "";
};
const resolveUserTemplate = (value: unknown, user: ImportedUser): unknown => {
  if (typeof value === "string")
    return value.replace(
      /\{(email_id|password|app_token|code|verify_forgot_code|location_id|loc_id|room_id|guest_id|hub_id|device_id|setting_id|report_type|type|client_id|client_secret)\}/g,
      (_match, key: string) => resolvePlaceholderValue(key, user),
    );
  if (Array.isArray(value))
    return value.map((item) => resolveUserTemplate(item, user));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveUserTemplate(item, user),
      ]),
    );
  return value;
};
const resolveTargetUrl = (value: string, user: ImportedUser) =>
  value.replace(
    /\{(email_id|password|app_token|code|verify_forgot_code|location_id|loc_id|room_id|guest_id|hub_id|device_id|setting_id|report_type|type|client_id|client_secret)\}/g,
    (_match, key: string) => resolvePlaceholderValue(key, user),
  );
setInterval(() => {
  if (metrics.status === "Running") {
    const requests = Math.floor(42 + Math.random() * 35);
    const failures = Math.random() > 0.88 ? 1 : 0;
    metrics = {
      ...metrics,
      totalRequests: metrics.totalRequests + requests,
      success: metrics.success + requests - failures,
      failed: metrics.failed + failures,
      tps: requests,
      avgResponse: Math.floor(220 + Math.random() * 160),
    };
    io.emit("metrics", metrics);
  }
}, 1000);
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
    `Failure rate - ${failureRate}`,
    "Thanks",
  ].join("\r\n");
  const emailSubject = "Load testinng for wiser inida";
  const encodedSubject = Buffer.from(emailSubject, "utf16le").toString("base64");
  const encodedBody = Buffer.from(emailBody, "utf16le").toString("base64");

  const script = [
    "$outlook = New-Object -ComObject Outlook.Application",
    "$mail = $outlook.CreateItem(0)",
    "$mail.To = 'SESA528360@se.com'",
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
        recipient: "SESA528360@se.com",
      });
      response.json({ message: "Analytics report sent to SESA528360@se.com." });
    },
  );
});
app.post(
  "/api/reports/scheduled-email",
  upload.single("screenshot"),
  async (request, response) => {
    if (!request.file)
      return response.status(400).json({ error: "A dashboard screenshot is required." });
    if (process.platform !== "win32")
      return response.status(501).json({ error: "Outlook desktop automation is available only on Windows." });
    const screenshotPath = join(tmpdir(), `wiser-dashboard-${randomUUID()}.png`);
    await writeFile(screenshotPath, request.file.buffer);
    const subject = `WISER scheduled load test report - ${new Date().toLocaleString()}`;
    const body = [
      "Hi Team,",
      "The hourly WISER load-test suite has completed.",
      `Requests: ${metrics.totalRequests}`,
      `Success rate: ${metrics.totalRequests ? ((metrics.success / metrics.totalRequests) * 100).toFixed(2) : "0.00"}%`,
      "The current dashboard is attached.",
      "Thanks",
    ].join("\r\n");
    const encode = (value: string) => Buffer.from(value, "utf16le").toString("base64");
    const script = [
      "$outlook = New-Object -ComObject Outlook.Application",
      "$mail = $outlook.CreateItem(0)",
      "$mail.To = 'SESA528360@se.com'",
      `$mail.Subject = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encode(subject)}'))`,
      `$mail.Body = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encode(body)}'))`,
      `$mail.Attachments.Add('${screenshotPath.replace(/'/g, "''")}') | Out-Null`,
      "$mail.Send()",
    ].join("; ");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], async (error) => {
      await unlink(screenshotPath).catch(() => undefined);
      if (error)
        return response.status(500).json({ error: "Outlook could not send the scheduled report." });
      response.json({ message: "Scheduled dashboard report sent." });
    });
  },
);
const isSuccessfulResponse = (statusCode: number, payload: unknown) => {
  if (statusCode < 200 || statusCode >= 400) return false;
  if (!payload || typeof payload !== "object") return true;
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
  const publicUserAuthEndpoints = new Set([
    "User Register",
    "User Verify",
    "Forgot Password",
    "Reset Password",
    "Resend Email",
    "Add Guest User",
    "Get Guest User",
    "Update Guest User",
    "Get Guest Access",
    "External User Login",
    "External OAuth Token",
  ]);
  const protectedUserEndpoints = new Set([
    "User Logout",
    "Validate User",
    "User Password",
    "User Status",
    "Update User",
    "Update User General",
    "User Update",
    "User Change",
    "Update User Email",
    "Federated Id Map",
    "Delete User",
    "User Codes",
    "User Details",
    "User Extended Details",
    "User General",
    "Super Location Add",
    "Super Location Get",
    "Super Location Details",
    "Super Location Update",
    "Add Location",
    "Location Details",
    "Update Location",
    "Location Settings Update",
    "Delete Location",
    "Location Settings",
    "Get Location Preference",
    "Update Location Preference",
    "Location Devices",
    "All Location Devices",
    "Device State",
    "Update Device Status",
    "Device Details",
    "Device Event State",
    "Device Event IR",
    "Device Event Configuration",
    "Add Room",
    "Get Rooms",
    "Get Room By ID",
    "Update Room",
    "Delete Room",
    "Add Hub",
    "Test Hub",
    "Hub Firmware",
    "Hub Count",
    "Get Hub By ID",
    "Hub Devices Count",
    "Add Device To Hub",
    "Get Devices By Hub",
    "Get Device By Hub",
    "Update Device By Hub",
    "Delete Device By Hub",
    "Upload Room Image",
    "Create Report",
    "Get Temperature Report",
    "Report Active Days",
    "Location Report",
    "Report Summary",
    "Report Daily",
    "Report Monthly",
    "Alert Summary",
    "Alert History",
    "Energy Latest",
    "Energy Latest Update",
    "Energy Activate",
    "Energy Events",
    "Energy Calculate",
    "Energy Reports",
    "Energy Net Consumption Month",
    "Energy Home Month",
    "Energy Weather",
    "Energy KPI",
    "External User Map",
    "External User Details",
    "External Locations",
    "External Location By ID",
    "External Super Location",
    "External Sites",
    "External Site By ID",
    "External Site Settings",
    "External Site Preferences",
    "External Site Rooms",
    "External Site Room By ID",
    "External Site Devices",
    "External Site Events State",
  ]);
  const requiresWiserAuthentication =
    isWiserApi(targetUrl) &&
    apiName !== "User Login" &&
    apiName !== "OAuth Token" &&
    !publicUserAuthEndpoints.has(apiName) &&
    (protectedUserEndpoints.has(apiName) ||
      apiName.startsWith("User ") ||
      apiName.startsWith("Super ") ||
      apiName.startsWith("Add ") ||
      apiName.startsWith("Get ") ||
      apiName.startsWith("Update ") ||
      apiName.startsWith("Delete ") ||
      apiName.startsWith("Location ") ||
      apiName.startsWith("Device ") ||
      apiName.startsWith("Hub ") ||
      apiName.startsWith("Room ") ||
      apiName.startsWith("Report ") ||
      apiName.startsWith("Energy ") ||
      apiName.startsWith("Alert ") ||
      apiName.startsWith("Upload ") ||
      apiName.startsWith("External "));
  const authorization =
    apiName === "User Login" || requiresWiserAuthentication
      ? process.env.WISER_LOGIN_AUTHORIZATION
      : undefined;
  if ((apiName === "User Login" || requiresWiserAuthentication) && !authorization)
    return response
      .status(500)
      .json({
        error: "Set WISER_LOGIN_AUTHORIZATION before running WISER APIs.",
      });
  const credential = importedUsers[0];
  const resolvedTargetUrl = resolveTargetUrl(targetUrl, credential);
  const requestBody = resolveUserTemplate(
    request.body.request?.body,
    credential,
  );
  metrics = { ...metrics, activeUsers: users, tps: 0, status: "Running" };
  const startedAt = performance.now();
  let statusCode = 0;
  let payload: unknown;
  try {
    if (requiresWiserAuthentication) {
      const loginAuthorization = authorization!;
      const login = await axios({
        url: "https://api.wiser-support.se.app/v1/user/login",
        method: "POST",
        headers: { "content-type": "application/json", authorization: loginAuthorization },
        data: credential,
        responseType: "text",
        timeout: 10000,
        validateStatus: () => true,
      });
      const loginPayload = parseResponseBody(login.data) as { code?: string };
      if (!loginPayload.code) {
        statusCode = login.status;
        payload = { error: "Login did not return an authorization code.", login: loginPayload };
      } else {
        const [clientId, clientSecret] = Buffer.from(
          loginAuthorization.replace(/^Basic\s+/i, ""),
          "base64",
        ).toString("utf8").split(":");
        const token = await axios({
          url: "https://api.wiser-support.se.app/v1/oauth/token",
          method: "POST",
          headers: {
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
        const tokenPayload = parseResponseBody(token.data) as { access_token?: string };
        if (!tokenPayload.access_token) {
          statusCode = token.status;
          payload = { error: "OAuth token exchange failed.", token: tokenPayload };
        } else {
          let resolvedUrl = resolvedTargetUrl;
          if (resolvedTargetUrl.includes("{location_id}")) {
            const locations = await axios({
              url: "https://api.wiser-support.se.app/v1/location/get",
              method: "GET",
              headers: {
                accept: "application/json",
                client_id: clientId,
                client_secret: clientSecret,
                access_token: tokenPayload.access_token,
              },
              responseType: "text",
              timeout: 10000,
              validateStatus: () => true,
            });
            const locationsPayload = parseResponseBody(locations.data) as {
              data?: { location_id?: string }[];
            };
            const locationId = locationsPayload.data?.[0]?.location_id;
            if (!locationId) {
              statusCode = locations.status;
              payload = { error: "Locations response did not include a location_id.", locations: locationsPayload };
            } else {
              resolvedUrl = resolvedTargetUrl.replaceAll("{location_id}", encodeURIComponent(locationId));
            }
          }
          if (!payload) {
          const upstream = await axios({
            url: resolvedUrl,
            method: request.body.request?.method || "GET",
            headers: {
              accept: "application/json",
              client_id: clientId,
              client_secret: clientSecret,
              access_token: tokenPayload.access_token,
            },
            responseType: "text",
            timeout: 10000,
            validateStatus: () => true,
          });
          statusCode = upstream.status;
          payload = parseResponseBody(upstream.data);
          }
        }
      }
    } else {
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
  const responseTime = Math.round(performance.now() - startedAt);
  const captured: CapturedResponse = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    api: apiName,
    user: credential.email_id,
    method: request.body.request?.method || "POST",
    statusCode,
    responseTime,
    result: isSuccessfulResponse(statusCode, payload) ? "Success" : "Failure",
    request: { url: targetUrl, body: requestBody },
    response: payload,
  };
  capturedResponses.unshift(captured);
  capturedResponses.splice(1000);
  logger.info("Load test run started", {
    id,
    api: captured.api,
    mode: request.body.mode,
    users,
    statusCode,
  });
  response
    .status(201)
    .json({ id, status: "Running", metrics, response: captured });
});
app.get("/api/responses", (_request, response) =>
  response.json(capturedResponses),
);
app.post("/api/runs/:id/stop", (request, response) => {
  metrics = { ...metrics, activeUsers: 0, tps: 0, status: "Stopped" };
  logger.info("Load test run stopped", { id: request.params.id });
  response.json({ metrics });
});
app.get("/api/suite-schedule", (_request, response) => response.json(suiteSchedule));
app.delete("/api/suite-schedule", (_request, response) => {
  if (scheduledSuiteTimer) clearTimeout(scheduledSuiteTimer);
  scheduledSuiteTimer = null;
  if (suiteSchedule) suiteSchedule.status = "Cancelled";
  response.json(suiteSchedule);
});
app.post("/api/suite-schedule", (request, response) => {
  const startsAt = new Date(request.body.startsAt);
  const apis = request.body.apis as ScheduledApi[];
  const virtualUsers = Math.min(Number(request.body.virtualUsers) || 25, 5000);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now())
    return response.status(400).json({ error: "Choose a future start time." });
  if (!Array.isArray(apis) || !apis.length)
    return response.status(400).json({ error: "Select at least one API to schedule." });
  if (scheduledSuiteTimer) clearTimeout(scheduledSuiteTimer);
  suiteSchedule = {
    id: randomUUID(),
    startsAt: startsAt.toISOString(),
    runsCompleted: 0,
    totalRuns: 24,
    status: "Scheduled",
  };
  const isScheduleCancelled = () =>
    !suiteSchedule || suiteSchedule.status === "Cancelled";
  const runSuite = async () => {
    if (isScheduleCancelled()) return;
    suiteSchedule!.status = "Running";
    for (const api of apis) {
      await axios.post(`http://127.0.0.1:${port}/api/runs`, {
        api: api.name,
        virtualUsers,
        mode: "Scheduled",
        request: { url: api.url, method: api.method, body: api.body },
      }).catch((error: unknown) => logger.warn("Scheduled API run failed", { api: api.name, error: error instanceof Error ? error.message : String(error) }));
    }
    if (isScheduleCancelled()) return;
    suiteSchedule!.runsCompleted += 1;
    io.emit("capture-dashboard-report", { schedule: suiteSchedule! });
    if (suiteSchedule!.runsCompleted >= suiteSchedule!.totalRuns) {
      suiteSchedule!.status = "Complete";
      scheduledSuiteTimer = null;
      return;
    }
    suiteSchedule!.status = "Scheduled";
    scheduledSuiteTimer = setTimeout(runSuite, 60 * 60 * 1000);
  };
  scheduledSuiteTimer = setTimeout(runSuite, startsAt.getTime() - Date.now());
  logger.info("Hourly suite schedule created", { ...suiteSchedule, apis: apis.length });
  response.status(201).json(suiteSchedule);
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
  if (kind === "users") {
    const workbook = XLSX.read(request.file.buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const header = (rows[0] || []).map((value) =>
      String(value).trim().toLowerCase(),
    );
    const hasHeader = header.includes("email_id");
    const emailIndex = hasHeader ? header.indexOf("email_id") : 0;
    const passwordIndex = hasHeader ? header.indexOf("password") : 1;
    const tokenIndex = hasHeader ? header.indexOf("app_token") : 2;
    const records = rows
      .slice(hasHeader ? 1 : 0)
      .map((row) => ({
        email_id: String(row[emailIndex] || "").trim(),
        password: String(row[passwordIndex] || "").trim(),
        app_token: String(row[tokenIndex] || "").trim(),
      }))
      .filter((record) =>
        Boolean(record.email_id && record.password && record.app_token),
      );
    const unique = records.filter(
      (record) =>
        !importedUsers.some((user) => user.email_id === record.email_id),
    );
    importedUsers.push(...unique);
    logger.info("Users imported", {
      file: request.file.originalname,
      count: unique.length,
    });
    return response.json({
      message: `${unique.length} user records accepted`,
      count: unique.length,
      total: importedUsers.length,
      records: importedUsers,
    });
  }
  const text = request.file.buffer.toString("utf8");
  const apis = [...text.matchAll(/<HTTPSamplerProxy\b[^>]*\btestname="([^"]+)"/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const threadGroups = [...text.matchAll(/<ThreadGroup\b[^>]*\btestname="([^"]+)"/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  importedJmeterApis.splice(0, importedJmeterApis.length, ...apis);
  const count = (text.match(/HTTPSamplerProxy/g) || []).length;
  logger.info("Import completed", {
    kind,
    file: request.file.originalname,
    count,
  });
  response.json({
    message: `${count} HTTP samplers discovered`,
    count,
    threadGroups: threadGroups.length,
    apis: importedJmeterApis,
  });
});
io.on("connection", (socket) => socket.emit("metrics", metrics));
const port = Number(process.env.PORT) || 3001;
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error(
      `Port ${port} is already in use. Stop the existing WISER service or start with PORT=<available-port>.`,
    );
    process.exitCode = 1;
    return;
  }
  logger.error("WISER API service could not start", { error: error.message });
  process.exitCode = 1;
});
server.listen(port, () => logger.info(`WISER API service listening on port ${port}`));
