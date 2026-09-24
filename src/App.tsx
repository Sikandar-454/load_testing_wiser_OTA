import { memo, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { io } from "socket.io-client";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import {
  Analytics,
  Api,
  Assessment,
  CloudUpload,
  Dashboard,
  Description,
  History,
  Pause,
  PlayArrow,
  Settings,
  Stop,
  TableChart,
} from "@mui/icons-material";
import { create } from "zustand";

type Metrics = {
  activeUsers: number;
  totalRequests: number;
  success: number;
  failed: number;
  tps: number;
  avgResponse: number;
  status: string;
};
type ImportedApi = {
  id: string;
  name: string;
  url: string;
  method: string;
  body?: unknown;
};
const useRunStore = create<{
  metrics: Metrics;
  apiCount: number;
  userCount: number;
  importedApis: ImportedApi[];
  environmentUrl: string;
  setMetrics: (metrics: Metrics) => void;
  setWorkspace: (workspace: { apiCount?: number; userCount?: number }) => void;
  setImportedApis: (apis: ImportedApi[]) => void;
  setEnvironmentUrl: (environmentUrl: string) => void;
}>((set) => ({
  metrics: {
    activeUsers: 0,
    totalRequests: 0,
    success: 0,
    failed: 0,
    tps: 0,
    avgResponse: 0,
    status: "Idle",
  },
  apiCount: 0,
  userCount: 0,
  importedApis: [],
  environmentUrl: "https://wiser-api-otastaging.azurewebsites.net",
  setMetrics: (metrics) => set({ metrics }),
  setWorkspace: (workspace) => set(workspace),
  setImportedApis: (apis) => set({ importedApis: apis }),
  setEnvironmentUrl: (environmentUrl) => set({ environmentUrl }),
}));
const nav = [
  ["Dashboard", Dashboard],
  ["Single API Runner", Api],
  ["Run All APIs", PlayArrow],
  ["API Response Viewer", TableChart],
  ["Analytics Dashboard", Analytics],
  ["Import Center", CloudUpload],
  ["Reports", Description],
  ["Run History", History],
  ["Settings", Settings],
] as const;
const requestTrend = [
  { time: "09:00", response: 210, tps: 38 },
  { time: "09:05", response: 265, tps: 54 },
  { time: "09:10", response: 238, tps: 74 },
  { time: "09:15", response: 322, tps: 61 },
  { time: "09:20", response: 276, tps: 88 },
  { time: "09:25", response: 284, tps: 80 },
];
const responses = [
  {
    time: "10:21:08",
    api: "User Login",
    user: "user_024",
    method: "POST",
    code: 200,
    duration: 248,
    result: "Success",
  },
  {
    time: "10:21:07",
    api: "Get Locations",
    user: "user_011",
    method: "GET",
    code: 200,
    duration: 181,
    result: "Success",
  },
  {
    time: "10:21:06",
    api: "Device State",
    user: "user_032",
    method: "GET",
    code: 504,
    duration: 5000,
    result: "Failure",
  },
  {
    time: "10:21:06",
    api: "User Login",
    user: "user_033",
    method: "POST",
    code: 401,
    duration: 125,
    result: "Warning",
  },
];
const apiBase =
  window.location.protocol === "file:" ? "http://localhost:3001" : "";
const targetEnvironments = [
  "https://wiser-api-otastaging.azurewebsites.net",
  "https://dev-sohaserver.azurewebsites.net",
  "https://soha-api-staging.azurewebsites.net",
  "https://api.wiser-support.se.app",
  "https://wiser-api.azurewebsites.net",
] as const;
const environmentLabels: Record<(typeof targetEnvironments)[number], string> = {
  "https://wiser-api-otastaging.azurewebsites.net": "BLAZE OTA-Staging",
  "https://dev-sohaserver.azurewebsites.net": "BLAZE Dev",
  "https://soha-api-staging.azurewebsites.net": "BLAZE Staging",
  "https://api.wiser-support.se.app": "SE OTA",
  "https://wiser-api.azurewebsites.net": "Production URL",
};
const credentialRequestBody = JSON.stringify(
  {
    email_id: "{email_id}",
    password: "{password}",
    app_token: "{app_token}",
  },
  null,
  2,
);
const replaceApiHost = (url: string, targetBaseUrl: string) => {
  const source = new URL(url);
  return `${targetBaseUrl}${source.pathname}${source.search}`;
};
const singleApiOptions = [
  { value: "login", name: "User Login", method: "POST", endpoint: "/v1/user/login" },
  { value: "register", name: "User Register", method: "POST", endpoint: "/v1/user/register" },
  { value: "verify", name: "User Verify", method: "POST", endpoint: "/v1/user/{code}/verify" },
  { value: "logout", name: "User Logout", method: "POST", endpoint: "/v1/user/logout" },
  { value: "validate", name: "Validate User", method: "GET", endpoint: "/v1/user/{code}/validate" },
  { value: "oauth-token", name: "OAuth Token", method: "POST", endpoint: "/v1/oauth/token" },
  { value: "password", name: "User Password", method: "POST", endpoint: "/v1/user/password" },
  { value: "forgot", name: "Forgot Password", method: "POST", endpoint: "/v1/user/forgot" },
  { value: "status", name: "User Status", method: "GET", endpoint: "/v1/user/{code}/status" },
  { value: "reset-password", name: "Reset Password", method: "POST", endpoint: "/v1/user/{verify_forgot_code}/password" },
  { value: "resend-email", name: "Resend Email", method: "POST", endpoint: "/v1/user/resendemail" },
  { value: "update-user", name: "Update User", method: "POST", endpoint: "/v1/user/update" },
  { value: "locations", name: "Get Locations", method: "GET", endpoint: "/v1/location/get" },
  { value: "devices", name: "Device State", method: "GET", endpoint: "/v1/device/{device_id}/state" },
] as const;
function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Paper className="metric">
      <Typography variant="caption">{label}</Typography>
      <Typography variant="h5">{value}</Typography>
      {sub && (
        <Typography className="metric-sub" variant="caption">
          {sub}
        </Typography>
      )}
    </Paper>
  );
}
function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Paper className="panel">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}
const ResponseTrendChart = memo(function ResponseTrendChart({ metrics }: { metrics: Metrics }) {
  const runMetrics = [
    { label: "Requests", value: metrics.totalRequests },
    { label: "Success", value: metrics.success },
    { label: "Failed", value: metrics.failed },
    { label: "TPS", value: metrics.tps },
  ];
  return (
    <Box height={260}>
      <ResponsiveContainer>
        <BarChart data={runMetrics}>
          <CartesianGrid vertical={false} stroke="#e6ecea" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#087f8c" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
});
const SystemUtilizationChart = memo(function SystemUtilizationChart({ metrics }: { metrics: Metrics }) {
  const currentRun = [
    { label: "Active users", value: metrics.activeUsers },
    { label: "TPS", value: metrics.tps },
  ];
  return (
    <Box height={220}>
      <ResponsiveContainer>
        <BarChart data={currentRun}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#e66a32" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
});

function DashboardView() {
  const metrics = useRunStore((state) => state.metrics);
  const apiCount = useRunStore((state) => state.apiCount);
  const userCount = useRunStore((state) => state.userCount);
  return (
    <Stack gap={2.5}>
      <Box>
        <Typography variant="h4">Operations overview</Typography>
        <Typography color="text.secondary">
          Live health for the WISER API test estate.
        </Typography>
      </Box>
      {!apiCount && !userCount && (
        <Alert severity="info">
          Import a JMeter test plan and user credentials in Import Center to begin testing.
        </Alert>
      )}
      <Box className="metric-grid">
        <Metric label="APIs LOADED" value={apiCount} sub="Imported JMeter APIs" />
        <Metric
          label="USERS LOADED"
          value={userCount}
          sub="Imported credentials"
        />
        <Metric
          label="ACTIVE TESTS"
          value={metrics.status === "Running" ? 1 : 0}
          sub={metrics.status}
        />
        <Metric
          label="REQUESTS EXECUTED"
          value={metrics.totalRequests.toLocaleString()}
          sub="Current execution"
        />
        <Metric
          label="SUCCESS RATE"
          value={metrics.totalRequests ? `${((metrics.success / metrics.totalRequests) * 100).toFixed(1)}%` : "0.0%"}
          sub={`${metrics.success.toLocaleString()} successful`}
        />
        <Metric
          label="AVG RESPONSE"
          value={`${metrics.avgResponse} ms`}
          sub="Current execution"
        />
        <Metric label="CURRENT TPS" value={metrics.tps} sub="Current execution" />
        <Metric
          label="PEAK RESPONSE"
          value={`${metrics.avgResponse} ms`}
          sub="Current execution"
        />
      </Box>
      <Box className="two-col">
        <Panel title="Run metrics">
          <ResponseTrendChart metrics={metrics} />
        </Panel>
        <Panel
          title="Live activity"
          action={<Chip size="small" color="success" label="CONNECTED" />}
        >
          <Typography color="text.secondary">
            {metrics.totalRequests
              ? `${metrics.totalRequests.toLocaleString()} requests recorded in the current run.`
              : "No test activity yet."}
          </Typography>
        </Panel>
      </Box>
      <Box className="two-col">
        <Panel title="Recent runs">
          <RunTable metrics={metrics} />
        </Panel>
        <Panel title="System utilization">
          <SystemUtilizationChart metrics={metrics} />
          <Stack direction="row" gap={1}>
            <Chip label={`${metrics.activeUsers} active users`} />
            <Chip label={`${metrics.tps} TPS`} />
            <Chip label={metrics.status} color={metrics.status === "Running" ? "success" : "default"} />
          </Stack>
        </Panel>
      </Box>
    </Stack>
  );
}
function RunTable({ metrics }: { metrics: Metrics }) {
  return (
    <Box component="table" className="data-table">
      <thead>
        <tr>
          <th>RUN</th>
          <th>MODE</th>
          <th>REQUESTS</th>
          <th>RESULT</th>
        </tr>
      </thead>
      <tbody>
        {metrics.totalRequests ? (
          <tr>
            <td>Current</td>
            <td>Load</td>
            <td>{metrics.totalRequests.toLocaleString()}</td>
            <td><Chip size="small" color={metrics.failed ? "warning" : "success"} label={metrics.status} /></td>
          </tr>
        ) : (
          <tr><td colSpan={4}>No runs yet.</td></tr>
        )}
      </tbody>
    </Box>
  );
}
function RunnerView() {
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [records, setRecords] = useState<CapturedResponse[]>([]);
  const [selectedApi, setSelectedApi] = useState("");
  const [method, setMethod] = useState("GET");
  const [endpoint, setEndpoint] = useState("");
  const [requestBody, setRequestBody] = useState(credentialRequestBody);
  const [virtualUsers, setVirtualUsers] = useState("50");
  const metrics = useRunStore((state) => state.metrics);
  const setMetrics = useRunStore((state) => state.setMetrics);
  const importedApis = useRunStore((state) => state.importedApis);
  const baseUrl = useRunStore((state) => state.environmentUrl);
  const setEnvironmentUrl = useRunStore((state) => state.setEnvironmentUrl);
  useEffect(() => {
    fetch(`${apiBase}/api/responses`)
      .then((response) => response.json())
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [metrics.totalRequests]);
  const responseTimes = records
    .map((record) => record.responseTime)
    .sort((left, right) => left - right);
  const p95 = responseTimes.length
    ? responseTimes[Math.min(responseTimes.length - 1, Math.ceil(responseTimes.length * 0.95) - 1)]
    : 0;
  const start = async () => {
    const api = importedApis.find((item) => item.id === selectedApi);
    if (!api) {
      setNotice("Import a JMeter test plan and select an API before running.");
      return;
    }
    setRunning(true);
    setNotice("");
    try {
      const response = await fetch(`${apiBase}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api: api.name,
          virtualUsers: Number(virtualUsers),
          mode: "Load",
          request: {
            url: `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`,
            method,
            body: requestBody ? JSON.parse(requestBody) : undefined,
          },
        }),
      });
      const run = await response.json();
      if (!response.ok)
        throw new Error(run.error || "The API request could not start.");
      setMetrics(run.metrics);
      setActiveRunId(run.id);
      setNotice(`Run ${run.id} started using imported user credentials.`);
    } catch (error) {
      setRunning(false);
      setNotice(
        error instanceof Error
          ? error.message
          : "The API request could not start.",
      );
    }
  };
  const stop = async () => {
    if (!activeRunId) return;
    const response = await fetch(`${apiBase}/api/runs/${activeRunId}/stop`, {
      method: "POST",
    });
    const result = await response.json();
    if (response.ok) {
      setMetrics(result.metrics);
      setRunning(false);
      setActiveRunId(null);
      setNotice(`Run ${activeRunId} stopped.`);
    } else {
      setNotice(result.error || "Unable to stop the API run.");
    }
  };
  return (
    <Stack gap={2.5}>
      <Box display="flex" justifyContent="space-between">
        <Box>
          <Typography variant="h4">Single API runner</Typography>
          <Typography color="text.secondary">
            Configure focused API load with isolated credentials.
          </Typography>
        </Box>
        <Chip
          className={`status ${running ? "running" : ""}`}
          label={running ? "RUNNING" : "STOPPED"}
        />
      </Box>
      {notice && (
        <Alert severity={notice.includes("Import") ? "warning" : "success"}>
          {notice}
        </Alert>
      )}
      <Box className="runner-grid">
        <Panel title="Request configuration">
          <Stack gap={2}>
            <TextField
              select
              label="API"
              value={selectedApi}
              onChange={(event) => {
                const api = importedApis.find((item) => item.id === event.target.value);
                if (!api) return;
                const importedUrl = new URL(api.url);
                setSelectedApi(api.id);
                setMethod(api.method);
                setEndpoint(`${importedUrl.pathname}${importedUrl.search}`);
                setRequestBody(
                  api.body === undefined
                    ? api.method.toUpperCase() === "GET"
                      ? ""
                      : credentialRequestBody
                    : JSON.stringify(api.body, null, 2),
                );
              }}
              fullWidth
              disabled={!importedApis.length}
            >
              {importedApis.length === 0 ? (
                <MenuItem value="">Import a JMeter test plan first</MenuItem>
              ) : importedApis.map((api) => (
                <MenuItem key={api.id} value={api.id}>
                  {api.method} {api.name}
                </MenuItem>
              ))}
            </TextField>
            <Box display="grid" gridTemplateColumns="120px 1fr" gap={1.5}>
              <TextField select label="Method" value={method} onChange={(event) => setMethod(event.target.value)}>
                <MenuItem value="POST">POST</MenuItem>
                <MenuItem value="GET">GET</MenuItem>
              </TextField>
              <TextField
                select
                label="Base URL"
                value={baseUrl}
                onChange={(event) => {
                  const environmentUrl = event.target.value as (typeof targetEnvironments)[number];
                  setEnvironmentUrl(environmentUrl);
                }}
              >
                {targetEnvironments.map((target) => (
                  <MenuItem key={target} value={target}>{environmentLabels[target]}</MenuItem>
                ))}
              </TextField>
            </Box>
            <TextField
              label="Endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
            <TextField
              label="Request body (JSON)"
              multiline
              minRows={8}
              value={requestBody}
              onChange={(event) => setRequestBody(event.target.value)}
              inputProps={{ style: { fontFamily: "monospace" } }}
            />
            <TextField
              label="Headers (JSON)"
              multiline
              minRows={3}
              defaultValue={'{\n  "Content-Type": "application/json"\n}'}
              inputProps={{ style: { fontFamily: "monospace" } }}
            />
          </Stack>
        </Panel>
        <Stack gap={2.5}>
          <Panel title="Load profile">
            <Box className="form-grid">
              <TextField
                label="Virtual users"
                type="number"
                value={virtualUsers}
                onChange={(event) => setVirtualUsers(event.target.value)}
              />
              <TextField label="Thread count" type="number" defaultValue="10" />
              <TextField
                label="Ramp up (sec)"
                type="number"
                defaultValue="15"
              />
              <TextField
                label="Duration (sec)"
                type="number"
                defaultValue="300"
              />
              <TextField label="Loop count" type="number" defaultValue="10" />
              <TextField
                label="Timeout (ms)"
                type="number"
                defaultValue="5000"
              />
              <TextField select label="Execution mode" defaultValue="Load">
                <MenuItem value="Baseline">Baseline</MenuItem>
                <MenuItem value="Load">Load</MenuItem>
                <MenuItem value="Stress">Stress</MenuItem>
                <MenuItem value="Spike">Spike</MenuItem>
                <MenuItem value="Soak">Soak</MenuItem>
              </TextField>
              <TextField select label="Credential pool" defaultValue="imported">
                <MenuItem value="imported">Imported users</MenuItem>
                <MenuItem value="single">Single user</MenuItem>
              </TextField>
            </Box>
          </Panel>
          <Panel title="Execution controls">
            <Stack direction="row" gap={1}>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={start}
                disabled={running || !selectedApi}
              >
                Run API
              </Button>
              <Button
                variant="outlined"
                startIcon={<Pause />}
                disabled={!running}
              >
                Pause
              </Button>
              <Button
                color="error"
                variant="outlined"
                startIcon={<Stop />}
                onClick={stop}
                disabled={!running}
              >
                Stop API
              </Button>
            </Stack>
          </Panel>
          <Panel title="Live metrics">
            <Box className="mini-metrics">
              <Metric label="REQUESTS" value={metrics.totalRequests.toLocaleString()} />
              <Metric label="SUCCESS" value={metrics.success.toLocaleString()} />
              <Metric label="FAILURES" value={metrics.failed.toLocaleString()} />
              <Metric label="P95" value={`${p95} ms`} />
            </Box>
          </Panel>
        </Stack>
      </Box>
      <Panel
        title="Live request log"
        action={<Chip size="small" label="Auto-scroll" />}
      >
        <ResponseTable records={records} />
      </Panel>
    </Stack>
  );
}
function ResponseTable({ records }: { records: CapturedResponse[] }) {
  return (
    <Box component="table" className="data-table">
      <thead>
        <tr>
          <th>TIMESTAMP</th>
          <th>API</th>
          <th>USER</th>
          <th>METHOD</th>
          <th>STATUS</th>
          <th>DURATION</th>
          <th>RESULT</th>
        </tr>
      </thead>
      <tbody>
        {records.length === 0 ? (
          <tr>
            <td colSpan={7}>No requests captured for this session.</td>
          </tr>
        ) : records.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.timestamp).toLocaleTimeString()}</td>
            <td>{row.api}</td>
            <td>{row.user}</td>
            <td>{row.method}</td>
            <td>{row.statusCode || "Network error"}</td>
            <td>{row.responseTime} ms</td>
            <td>
              <Chip
                size="small"
                color={
                  row.result === "Success"
                    ? "success"
                    : "error"
                }
                label={row.result}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}
const suiteApis = [
  {
    name: "User Register",
    url: "https://api.wiser-support.se.app/v1/user/register",
    method: "POST",
    body: {
      email_id: "{email_id}",
      password: "{password}",
      app_token: "{app_token}",
    },
  },
  {
    name: "User Verify",
    url: "https://api.wiser-support.se.app/v1/user/{code}/verify",
    method: "GET",
  },
  {
    name: "User Login",
    url: "https://api.wiser-support.se.app/v1/user/login",
    method: "POST",
    body: {
      email_id: "{email_id}",
      password: "{password}",
      app_token: "{app_token}",
    },
  },
  {
    name: "User Logout",
    url: "https://api.wiser-support.se.app/v1/user/logout",
    method: "GET",
  },
  {
    name: "Validate User",
    url: "https://api.wiser-support.se.app/v1/user/{code}/validate",
    method: "PUT",
    body: {
      status: "active",
    },
  },
  {
    name: "OAuth Token",
    url: "https://api.wiser-support.se.app/v1/oauth/token",
    method: "POST",
    body: {
      code: "{code}",
      grant_type: "code",
      client_id: "{client_id}",
      client_secret: "{client_secret}",
    },
  },
  {
    name: "User Password",
    url: "https://api.wiser-support.se.app/v1/user/password",
    method: "POST",
    body: {
      password: "{password}",
      app_token: "{app_token}",
    },
  },
  {
    name: "Forgot Password",
    url: "https://api.wiser-support.se.app/v1/user/forgot",
    method: "POST",
    body: {
      email_id: "{email_id}",
      app_token: "{app_token}",
    },
  },
  {
    name: "User Status",
    url: "https://api.wiser-support.se.app/v1/user/{code}/status",
    method: "GET",
  },
  {
    name: "Reset Password",
    url: "https://api.wiser-support.se.app/v1/user/{verify_forgot_code}/password",
    method: "POST",
    body: {
      password: "{password}",
      confirm_password: "{password}",
    },
  },
  {
    name: "Resend Email",
    url: "https://api.wiser-support.se.app/v1/user/resendemail",
    method: "POST",
    body: {
      email_id: "{email_id}",
      app_token: "{app_token}",
    },
  },
  {
    name: "Update User",
    url: "https://api.wiser-support.se.app/v1/user/{code}/user",
    method: "PUT",
    body: {
      email_id: "{email_id}",
      app_token: "{app_token}",
    },
  },
  {
    name: "Get Preferences",
    url: "https://api.wiser-support.se.app/v1/location/preference/{location_id}/get",
    method: "GET",
  },
  { name: "User Codes", url: "https://api.wiser-support.se.app/v1/user/getcodes", method: "GET" },
  { name: "User Details", url: "https://api.wiser-support.se.app/v1/user/details", method: "GET" },
  { name: "User Extended Details", url: "https://api.wiser-support.se.app/v1/user/edetails", method: "GET" },
  { name: "User General", url: "https://api.wiser-support.se.app/v1/user/general", method: "GET" },
  { name: "Update User General", url: "https://api.wiser-support.se.app/v1/user/general", method: "POST", body: { name: "{email_id}", status: "active" } },
  { name: "User Update", url: "https://api.wiser-support.se.app/v1/user/update", method: "POST", body: { email_id: "{email_id}", app_token: "{app_token}" } },
  { name: "User Change", url: "https://api.wiser-support.se.app/v1/user/change", method: "POST", body: { email_id: "{email_id}", password: "{password}" } },
  { name: "Update User Email", url: "https://api.wiser-support.se.app/v1/user/updateemail", method: "POST", body: { email_id: "{email_id}", new_email: "{email_id}" } },
  { name: "Federated Id Map", url: "https://api.wiser-support.se.app/v1/user/federatedId/map", method: "POST", body: { user_id: "{code}", federated_id: "{code}" } },
  { name: "Delete User", url: "https://api.wiser-support.se.app/v1/user/delete", method: "PUT", body: { code: "{code}" } },
  { name: "Add Guest User", url: "https://api.wiser-support.se.app/v1/user/addGuest", method: "POST", body: { email_id: "{email_id}", app_token: "{app_token}" } },
  { name: "Get Guest User", url: "https://api.wiser-support.se.app/v1/user/getGuest", method: "GET" },
  { name: "Update Guest User", url: "https://api.wiser-support.se.app/v1/user/{guest_id}/updateGuest", method: "POST", body: { guest_id: "{guest_id}", status: "active" } },
  { name: "Get Guest Access", url: "https://api.wiser-support.se.app/v1/user/{location_id}/getGuestaccess", method: "GET" },
  { name: "Super Location Add", url: "https://api.wiser-support.se.app/v1/location/super/add", method: "POST", body: { location_name: "{location_id}", app_token: "{app_token}" } },
  { name: "Super Location Get", url: "https://api.wiser-support.se.app/v1/location/super/get", method: "GET" },
  { name: "Super Location Details", url: "https://api.wiser-support.se.app/v1/location/super/{loc_id}/get", method: "GET" },
  { name: "Super Location Update", url: "https://api.wiser-support.se.app/v1/location/super/{loc_id}/update", method: "POST", body: { location_name: "{location_id}", status: "active" } },
  { name: "Add Location", url: "https://api.wiser-support.se.app/v1/location/add", method: "POST", body: { location_name: "{location_id}", app_token: "{app_token}" } },
  { name: "Get Locations", url: "https://api.wiser-support.se.app/v1/location/get", method: "GET" },
  { name: "Location Details", url: "https://api.wiser-support.se.app/v1/location/{location_id}/get", method: "GET" },
  { name: "Update Location", url: "https://api.wiser-support.se.app/v1/location/{location_id}/update", method: "POST", body: { location_name: "{location_id}", status: "active" } },
  { name: "Location Settings Update", url: "https://api.wiser-support.se.app/v1/location/{location_id}/settings/{setting_id}", method: "POST", body: { setting_id: "{setting_id}", value: true } },
  { name: "Delete Location", url: "https://api.wiser-support.se.app/v1/location/{location_id}/delete", method: "POST", body: { reason: "test-delete" } },
  { name: "Location Settings", url: "https://api.wiser-support.se.app/v1/location/{location_id}/settings", method: "GET" },
  { name: "Get Location Preference", url: "https://api.wiser-support.se.app/v1/location/preference/{location_id}/get", method: "GET" },
  { name: "Update Location Preference", url: "https://api.wiser-support.se.app/v1/location/preference/{location_id}/update", method: "POST", body: { preference: "notification", value: true } },
  { name: "Location Devices", url: "https://api.wiser-support.se.app/v1/location/device/{location_id}/get", method: "GET" },
  { name: "All Location Devices", url: "https://api.wiser-support.se.app/v1/location/device/{location_id}/all", method: "GET" },
  { name: "Device State", url: "https://api.wiser-support.se.app/v1/device/{device_id}/state", method: "GET" },
  { name: "Update Device Status", url: "https://api.wiser-support.se.app/v1/device/{device_id}/status", method: "POST", body: { status: "active" } },
  { name: "Device Details", url: "https://api.wiser-support.se.app/v1/device/{device_id}/details", method: "GET" },
  { name: "Add Room", url: "https://api.wiser-support.se.app/v1/location/room/{location_id}/add", method: "POST", body: { room_name: "Room 1", app_token: "{app_token}" } },
  { name: "Get Rooms", url: "https://api.wiser-support.se.app/v1/location/room/{location_id}/get", method: "GET" },
  { name: "Get Room By ID", url: "https://api.wiser-support.se.app/v1/location/room/{location_id}/get/{room_id}", method: "GET" },
  { name: "Update Room", url: "https://api.wiser-support.se.app/v1/location/room/{location_id}/update/{room_id}", method: "POST", body: { room_name: "Updated Room", status: "active" } },
  { name: "Delete Room", url: "https://api.wiser-support.se.app/v1/location/room/{location_id}/delete/{room_id}", method: "POST", body: { reason: "test-delete" } },
  { name: "Add Hub", url: "https://api.wiser-support.se.app/v1/hub/add", method: "POST", body: { hub_name: "Hub 1", app_token: "{app_token}" } },
  { name: "Test Hub", url: "https://api.wiser-support.se.app/v1/hub/test/hub", method: "POST", body: { hub_name: "Hub 1", app_token: "{app_token}" } },
  { name: "Hub Firmware", url: "https://api.wiser-support.se.app/v1/hub/firmware", method: "POST", body: { hub_id: "{hub_id}", version: "1.0.0" } },
  { name: "Hub Count", url: "https://api.wiser-support.se.app/v1/hub/count", method: "GET" },
  { name: "Get Hub By ID", url: "https://api.wiser-support.se.app/v1/hub/{hub_id}/get", method: "GET" },
  { name: "Hub Devices Count", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/count", method: "GET" },
  { name: "Add Device To Hub", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/add", method: "POST", body: { device_name: "Device 1", app_token: "{app_token}" } },
  { name: "Get Devices By Hub", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/get", method: "GET" },
  { name: "Get Device By Hub", url: "https://api.wiser-support.se.app/v1/device/{hub_id}/get/{device_id}", method: "GET" },
  { name: "Update Device By Hub", url: "https://api.wiser-support.se.app/v1/device/{hub_id}/update/{device_id}", method: "POST", body: { device_name: "Updated Device", status: "active" } },
  { name: "Delete Device By Hub", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/delete/{device_id}", method: "POST", body: { reason: "test-delete" } },
  { name: "Upload Room Image", url: "https://api.wiser-support.se.app/v1/upload/{room_id}/room/image", method: "POST", body: { file: "room-image.jpg" } },
  { name: "Location Event State", url: "https://api.wiser-support.se.app/v1/location/event/{location_id}/state", method: "GET" },
  { name: "Device Event State", url: "https://api.wiser-support.se.app/v1/event/{device_id}/state", method: "GET" },
  { name: "Device Event IR", url: "https://api.wiser-support.se.app/v1/event/{device_id}/ir", method: "GET" },
  { name: "Device Event Configuration", url: "https://api.wiser-support.se.app/v1/event/{device_id}/configuration", method: "GET" },
  { name: "Create Report", url: "https://api.wiser-support.se.app/v1/report/{location_id}/reports", method: "POST", body: { report_type: "daily", location_id: "{location_id}" } },
  { name: "Get Temperature Report", url: "https://api.wiser-support.se.app/v1/report/{location_id}/get/temperature", method: "POST", body: { location_id: "{location_id}", report_type: "temperature" } },
  { name: "Report Active Days", url: "https://api.wiser-support.se.app/v1/report/{location_id}/reports/active/days", method: "GET" },
  { name: "Location Report", url: "https://api.wiser-support.se.app/v1/report/{location_id}/location", method: "POST", body: { location_id: "{location_id}", report_type: "summary" } },
  { name: "Report Summary", url: "https://api.wiser-support.se.app/v1/report/{location_id}/summary", method: "GET" },
  { name: "Report Daily", url: "https://api.wiser-support.se.app/v1/report/{location_id}/daily", method: "GET" },
  { name: "Report Monthly", url: "https://api.wiser-support.se.app/v1/report/{location_id}/monthly", method: "GET" },
  { name: "Alert Summary", url: "https://api.wiser-support.se.app/v1/alert/{location_id}/summary", method: "GET" },
  { name: "Alert History", url: "https://api.wiser-support.se.app/v1/alert/{location_id}/history", method: "GET" },
  { name: "Energy Latest", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/latest", method: "GET" },
  { name: "Energy Latest Update", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/latest", method: "POST", body: { device_id: "{device_id}", report_type: "latest" } },
  { name: "Energy Activate", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/activate", method: "GET" },
  { name: "Energy Events", url: "https://api.wiser-support.se.app/v1/energy/{type}/events/{report_type}", method: "POST", body: { type: "{type}", report_type: "{report_type}" } },
  { name: "Energy Calculate", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/calculate/{type}", method: "POST", body: { device_id: "{device_id}", type: "{type}" } },
  { name: "Energy Reports", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/reports", method: "POST", body: { device_id: "{device_id}", report_type: "daily" } },
  { name: "Energy Net Consumption Month", url: "https://api.wiser-support.se.app/v1/energy/{location_id}/netconsumption/month", method: "POST", body: { location_id: "{location_id}", month: "2026-09" } },
  { name: "Energy Home Month", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/home/month", method: "POST", body: { device_id: "{device_id}", month: "2026-09" } },
  { name: "Energy Weather", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/weather", method: "GET" },
  { name: "Energy KPI", url: "https://api.wiser-support.se.app/v1/energy/{device_id}/kpi", method: "GET" },
  { name: "External User Login", url: "https://api.wiser-support.se.app/v1/ex/user/login", method: "POST", body: { email_id: "{email_id}", password: "{password}", app_token: "{app_token}" } },
  { name: "External OAuth Token", url: "https://api.wiser-support.se.app/v1/ex/oauth/token", method: "POST", body: { code: "{code}", grant_type: "code", client_id: "{client_id}", client_secret: "{client_secret}" } },
  { name: "External User Map", url: "https://api.wiser-support.se.app/v1/ex/user/map", method: "POST", body: { user_id: "{code}", app_token: "{app_token}" } },
  { name: "External User Details", url: "https://api.wiser-support.se.app/v1/ex/user-details", method: "GET" },
  { name: "External Locations", url: "https://api.wiser-support.se.app/v1/ex/locations", method: "GET" },
  { name: "External Location By ID", url: "https://api.wiser-support.se.app/v1/ex/locations/{id}", method: "GET" },
  { name: "External Super Location", url: "https://api.wiser-support.se.app/v1/ex/super-location/{superlocation_id}", method: "GET" },
  { name: "External Sites", url: "https://api.wiser-support.se.app/v1/ex/sites", method: "GET" },
  { name: "External Site By ID", url: "https://api.wiser-support.se.app/v1/ex/sites/{siteId}", method: "GET" },
  { name: "External Site Settings", url: "https://api.wiser-support.se.app/v1/ex/site-settings/{site_id}", method: "GET" },
  { name: "External Site Preferences", url: "https://api.wiser-support.se.app/v1/ex/site-preferences/{siteId}", method: "GET" },
  { name: "External Site Rooms", url: "https://api.wiser-support.se.app/v1/ex/sites/{siteId}/rooms", method: "GET" },
  { name: "External Site Room By ID", url: "https://api.wiser-support.se.app/v1/ex/sites/{siteId}/rooms/{roomId}", method: "GET" },
  { name: "External Site Devices", url: "https://api.wiser-support.se.app/v1/ex/sites/{siteId}/devices", method: "GET" },
  { name: "External Site Events State", url: "https://api.wiser-support.se.app/v1/ex/sites/{siteId}/events-state", method: "GET" },
  { name: "External Energy Device", url: "https://api.wiser-support.se.app/v1/ex/energy/{deviceId}", method: "GET" },
  { name: "External Energy Calculate", url: "https://api.wiser-support.se.app/v1/ex/energy/{device_id}/calculate/{type}", method: "POST", body: { device_id: "{device_id}", type: "{type}" } },
  { name: "External Energy Events", url: "https://api.wiser-support.se.app/v1/ex/energy/{type}/events/{report_type}", method: "POST", body: { type: "{type}", report_type: "{report_type}" } },
  { name: "External Energy Event By Type", url: "https://api.wiser-support.se.app/v1/ex/energy/{device_id}/event/{type}/{report_type}", method: "POST", body: { device_id: "{device_id}", type: "{type}", report_type: "{report_type}" } },
  { name: "External Energy Home Type", url: "https://api.wiser-support.se.app/v1/ex/energy/{site_id}/home/{type}", method: "POST", body: { site_id: "{site_id}", type: "{type}" } },
  { name: "External Device Configuration", url: "https://api.wiser-support.se.app/v1/ex/events/device-configuration/{device_id}", method: "GET" },
  { name: "AIML Get All Tips", url: "https://api.wiser-support.se.app/v1/aiml/getalltips", method: "GET" },
  { name: "AIML Get Action Tips", url: "https://api.wiser-support.se.app/v1/aiml/getactionbasedtips", method: "GET" },
  { name: "AIML Post Tip Action", url: "https://api.wiser-support.se.app/v1/aiml/posttipaction", method: "POST", body: { action: "view" } },
  { name: "Recommendation Get All", url: "https://api.wiser-support.se.app/v1/aimlrecom/getallrecommendation", method: "GET" },
  { name: "Recommendation Post Action", url: "https://api.wiser-support.se.app/v1/aimlrecom/postrecomaction", method: "POST", body: { action: "accept" } },
];
function RunAllView() {
  const importedApis = useRunStore((state) => state.importedApis);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("ALL");
  const [running, setRunning] = useState(false);
  const activeRunId = useRef<string | null>(null);
  const stopRequested = useRef(false);
  const [virtualUsers, setVirtualUsers] = useState("25");
  const [scheduleTime, setScheduleTime] = useState("");
  const [reportRecipients, setReportRecipients] = useState("SESA528360@se.com");
  const [schedule, setSchedule] = useState<{
    startsAt: string;
    runsCompleted: number;
    totalRuns: number;
    status: string;
  } | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [logs, setLogs] = useState<
    { id: string; api: string; status: string; duration?: number; detail?: string }[]
  >([]);
  const setMetrics = useRunStore((state) => state.setMetrics);
  const targetBaseUrl = useRunStore((state) => state.environmentUrl);
  const setEnvironmentUrl = useRunStore((state) => state.setEnvironmentUrl);
  const toggle = (api: string) =>
    setSelected((items) =>
      items.includes(api)
        ? items.filter((item) => item !== api)
        : [...items, api],
    );
  const selectByMethod = (method: string) => {
    setSelectedMethod(method);
    setSelected(
      importedApis
        .filter((api) => method === "ALL" || api.method.toUpperCase() === method)
        .map((api) => api.id),
    );
  };
  useEffect(() => {
    fetch(`${apiBase}/api/suite-schedule`)
      .then((response) => response.json())
      .then(setSchedule)
      .catch(() => undefined);
  }, []);
  const runAll = async () => {
    stopRequested.current = false;
    setRunning(true);
    setLogs(selected.map((id) => ({ id, api: importedApis.find((item) => item.id === id)?.name || id, status: "Queued" })));
    for (const id of selected) {
      if (stopRequested.current) {
        setLogs((items) =>
          items.map((item) =>
            item.status === "Queued" ? { ...item, status: "Stopped" } : item,
          ),
        );
        break;
      }
      const api = importedApis.find((item) => item.id === id)!;
      if (!api.url) {
        setLogs((items) =>
          items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "Needs endpoint",
                  detail:
                    "This API requires the JMeter authentication flow and an access token. Imported JMeter samplers are not yet run by this view.",
                }
              : item,
          ),
        );
        continue;
      }
      setLogs((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: "Running" } : item,
        ),
      );
      try {
        const response = await fetch(`${apiBase}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api: api.name,
            virtualUsers: Number(virtualUsers),
            mode: "Parallel",
            request: { ...api, url: replaceApiHost(api.url, targetBaseUrl) },
          }),
        });
        const run = await response.json();
        if (!response.ok) throw new Error(run.error);
        activeRunId.current = run.id;
        setMetrics(run.metrics);
        setLogs((items) =>
          items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: run.response.result,
                  duration: run.response.responseTime,
                }
              : item,
          ),
        );
      } catch (error) {
        setLogs((items) =>
          items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "Failed",
                  detail:
                    error instanceof Error ? error.message : "Request failed",
                }
              : item,
          ),
        );
      }
    }
    setRunning(false);
    activeRunId.current = null;
  };
  const stopAll = async () => {
    stopRequested.current = true;
    const runId = activeRunId.current || "suite";
    const response = await fetch(`${apiBase}/api/runs/${runId}/stop`, {
      method: "POST",
    });
    const result = await response.json();
    if (response.ok) setMetrics(result.metrics);
    setRunning(false);
  };
  const scheduleHourlySuite = async () => {
    setScheduleNotice("");
    try {
      const response = await fetch(`${apiBase}/api/suite-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: new Date(scheduleTime).toISOString(),
          virtualUsers: Number(virtualUsers),
          apis: importedApis
            .filter((api) => selected.includes(api.id) && api.url)
            .map((api) => ({ ...api, url: replaceApiHost(api.url, targetBaseUrl) })),
          recipients: reportRecipients,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to schedule the suite.");
      setSchedule(data);
      setScheduleNotice("Hourly suite scheduled for 24 runs. Each cycle emails a Dashboard screenshot.");
    } catch (error) {
      setScheduleNotice(error instanceof Error ? error.message : "Unable to schedule the suite.");
    }
  };
  const cancelSchedule = async () => {
    const response = await fetch(`${apiBase}/api/suite-schedule`, { method: "DELETE" });
    const data = await response.json();
    setSchedule(data);
    setScheduleNotice("Hourly suite schedule cancelled.");
  };
  return (
    <Stack gap={2.5}>
      <Box display="flex" justifyContent="space-between">
        <Box>
          <Typography variant="h4">Run all APIs</Typography>
          <Typography color="text.secondary">
            Execute selected APIs and review their combined live execution log.
          </Typography>
        </Box>
        <Chip
          className={`status ${running ? "running" : ""}`}
          label={running ? "EXECUTING" : "READY"}
        />
      </Box>
      <Box className="runner-grid">
        <Panel
          title="API execution plan"
          action={
            <TextField
              select
              size="small"
              label="Select APIs"
              value={selectedMethod}
              onChange={(event) => selectByMethod(event.target.value)}
              disabled={!importedApis.length}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="ALL">All methods</MenuItem>
              <MenuItem value="GET">GET only</MenuItem>
              <MenuItem value="POST">POST only</MenuItem>
              <MenuItem value="PUT">PUT only</MenuItem>
            </TextField>
          }
        >
          <Stack gap={0.5} sx={{ maxHeight: 650, overflowY: "auto", pr: 1 }}>
            {importedApis.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                Import a JMeter test plan to populate the execution plan.
              </Typography>
            ) : importedApis.map((api) => (
              <ListItemButton
                key={api.id}
                onClick={() => toggle(api.id)}
                selected={selected.includes(api.id)}
              >
                <ListItemIcon>
                  <input
                    type="checkbox"
                    checked={selected.includes(api.id)}
                    readOnly
                  />
                </ListItemIcon>
                <ListItemText
                  primary={api.name}
                  secondary={
                    api.url
                      ? `${api.method} ${replaceApiHost(api.url, targetBaseUrl)}`
                          : "Endpoint required from JMeter configuration"
                  }
                />
              </ListItemButton>
            ))}
          </Stack>
        </Panel>
        <Stack gap={2.5}>
          <Panel title="Suite configuration">
            <Box className="form-grid">
              <TextField
                select
                label="API environment"
                value={targetBaseUrl}
                onChange={(event) => {
                  const environmentUrl = event.target.value as (typeof targetEnvironments)[number];
                  setEnvironmentUrl(environmentUrl);
                }}
              >
                {targetEnvironments.map((target) => (
                  <MenuItem key={target} value={target}>{environmentLabels[target]}</MenuItem>
                ))}
              </TextField>
              <TextField select label="Execution mode" defaultValue="Parallel">
                <MenuItem value="Sequential">Sequential</MenuItem>
                <MenuItem value="Parallel">Parallel</MenuItem>
                <MenuItem value="Stress">Stress</MenuItem>
              </TextField>
              <TextField
                label="Virtual users"
                type="number"
                value={virtualUsers}
                onChange={(event) => setVirtualUsers(event.target.value)}
              />
              <TextField label="Loop count" type="number" defaultValue="10" />
              <TextField
                label="Ramp up (sec)"
                type="number"
                defaultValue="15"
              />
            </Box>
          </Panel>
          <Panel title="Hourly report schedule">
            <Stack gap={1.5}>
              <TextField
                label="First run"
                type="datetime-local"
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Report email recipients"
                value={reportRecipients}
                onChange={(event) => setReportRecipients(event.target.value)}
                helperText="Separate multiple addresses with commas or semicolons."
              />
              <Typography variant="body2" color="text.secondary">
                Runs the selected APIs once per hour for 24 hours and emails a Dashboard screenshot after every run.
              </Typography>
              {schedule && schedule.status !== "Cancelled" && schedule.status !== "Complete" && (
                <Chip
                  color="secondary"
                  label={`${schedule.status}: ${schedule.runsCompleted}/${schedule.totalRuns} runs`}
                />
              )}
              {scheduleNotice && <Alert severity="info">{scheduleNotice}</Alert>}
              <Stack direction="row" gap={1}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  disabled={!scheduleTime || !selected.length}
                  onClick={scheduleHourlySuite}
                >
                  Schedule hourly
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={!schedule || schedule.status === "Cancelled" || schedule.status === "Complete"}
                  onClick={cancelSchedule}
                >
                  Cancel schedule
                </Button>
              </Stack>
            </Stack>
          </Panel>
          <Panel title="Suite controls">
            <Stack direction="row" gap={1}>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                disabled={running || !selected.length || !importedApis.length}
                onClick={runAll}
              >
                Run all ({selected.length})
              </Button>
              <Button
                variant="outlined"
                startIcon={<Pause />}
                disabled={!running}
              >
                Pause all
              </Button>
              <Button
                color="error"
                variant="outlined"
                startIcon={<Stop />}
                disabled={!running}
                onClick={stopAll}
              >
                Stop all
              </Button>
            </Stack>
          </Panel>
        </Stack>
      </Box>
      <Panel
        title="Run all execution log"
        action={<Chip size="small" label={`${logs.length} APIs`} />}
      >
        <Box sx={{ maxHeight: 1100, overflowY: "auto" }}>
          <Box component="table" className="data-table">
            <thead>
              <tr>
                <th>API</th>
                <th>EXECUTION STATUS</th>
                <th>RESPONSE TIME</th>
                <th>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {logs.length ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.api}</td>
                    <td>
                      <Chip
                        size="small"
                        color={
                          log.status === "Success"
                            ? "success"
                            : log.status === "Running"
                              ? "warning"
                              : log.status === "Queued"
                                ? "default"
                                : "error"
                        }
                        label={log.status}
                      />
                    </td>
                    <td>{log.duration ? `${log.duration} ms` : "-"}</td>
                    <td>{log.detail || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    Select APIs and choose Run all to begin capturing suite logs.
                  </td>
                </tr>
              )}
            </tbody>
          </Box>
        </Box>
      </Panel>
    </Stack>
  );
}
const reportRows = [
  ["User Login", "2,480", "98.7%", "248 ms", "612 ms", "0.8%"],
  ["Get Locations", "2,160", "99.4%", "181 ms", "418 ms", "0.3%"],
  ["Get Devices", "2,120", "97.8%", "332 ms", "891 ms", "2.2%"],
  ["Device State", "1,960", "95.1%", "488 ms", "1.84 s", "4.9%"],
];
function ReportsView() {
  const [message, setMessage] = useState("");
  const exportCsv = () => {
    const csv = [
      "API,Requests,Success rate,Average,P95,Failure rate",
      ...reportRows.map((row) => row.join(",")),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "WISER-load-test-LT-2026-084.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage("CSV report downloaded.");
  };
  return (
    <Stack gap={2.5}>
      <Box display="flex" justifyContent="space-between" alignItems="end">
        <Box>
          <Typography variant="h4">Reports</Typography>
          <Typography color="text.secondary">
            Export a complete record of execution LT-2026-084.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="outlined" disabled>
            Export Excel
          </Button>
          <Button variant="contained" disabled>
            Export PDF
          </Button>
        </Stack>
      </Box>
      {message && <Alert severity="success">{message}</Alert>}
      <Box className="metric-grid">
        <Metric
          label="EXECUTION RUN"
          value="LT-2026-084"
          sub="Load / OTA Staging"
        />
        <Metric label="TOTAL REQUESTS" value="12,840" sub="50 virtual users" />
        <Metric label="SUCCESS RATE" value="98.4%" sub="12,638 successful" />
        <Metric label="AVG RESPONSE" value="286 ms" sub="P95: 612 ms" />
        <Metric label="PEAK TPS" value="92.4" sub="at 10:18:43" />
        <Metric label="FAILURES" value="202" sub="1.6% of requests" />
        <Metric label="DURATION" value="05:00" sub="Completed" />
        <Metric label="ENVIRONMENT" value="Staging" sub="Wiser OTA" />
      </Box>
      <Box className="two-col">
        <Panel title="Execution summary">
          <Stack gap={1.5}>
            <Typography>
              Run <b>LT-2026-084</b> completed with stable throughput across 50
              virtual users.
            </Typography>
            <Typography color="text.secondary">
              Most APIs met the 500 ms response target. Device State requires
              attention because its P95 latency exceeds the target.
            </Typography>
            <Alert severity="warning">
              Recommendation: review the Device State dependency before raising
              this profile above 50 concurrent users.
            </Alert>
          </Stack>
        </Panel>
        <Panel title="Included in export">
          <Stack gap={1}>
            <Typography>Execution summary and configuration</Typography>
            <Typography>API-level response times and percentiles</Typography>
            <Typography>Failures, status codes, and recommendations</Typography>
            <Typography>Response-time and throughput trend charts</Typography>
          </Stack>
        </Panel>
      </Box>
      <Panel
        title="API statistics"
        action={<Chip size="small" color="success" label="Completed" />}
      >
        <Box component="table" className="data-table">
          <thead>
            <tr>
              <th>API</th>
              <th>REQUESTS</th>
              <th>SUCCESS RATE</th>
              <th>AVERAGE</th>
              <th>P95</th>
              <th>FAILURE RATE</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.map((row) => (
              <tr key={row[0]}>
                {row.map((value) => (
                  <td key={value}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </Box>
      </Panel>
    </Stack>
  );
}
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
function ResponseViewerView() {
  const [records, setRecords] = useState<CapturedResponse[]>([]);
  const [selected, setSelected] = useState<CapturedResponse | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/api/responses`)
      .then((response) => response.json())
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);
  return (
    <Stack gap={2}>
      <Box display="flex" justifyContent="space-between">
        <Box>
          <Typography variant="h4">API response viewer</Typography>
          <Typography color="text.secondary">
            Captured payloads from executed API requests.
          </Typography>
        </Box>
        <Button
          size="small"
          onClick={() =>
            fetch(`${apiBase}/api/responses`)
              .then((response) => response.json())
              .then(setRecords)
          }
        >
          Refresh
        </Button>
      </Box>
      <Panel title={`Captured responses (${records.length})`}>
        {records.length === 0 ? (
          <Typography color="text.secondary">
            Run an API test to inspect its request and response here.
          </Typography>
        ) : (
          <Box component="table" className="data-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>API</th>
                <th>USER</th>
                <th>METHOD</th>
                <th>STATUS</th>
                <th>DURATION</th>
                <th>RESULT</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  onClick={() => setSelected(record)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{new Date(record.timestamp).toLocaleTimeString()}</td>
                  <td>{record.api}</td>
                  <td>{record.user}</td>
                  <td>{record.method}</td>
                  <td>{record.statusCode || "Network error"}</td>
                  <td>{record.responseTime} ms</td>
                  <td>
                    <Chip
                      size="small"
                      color={record.result === "Success" ? "success" : "error"}
                      label={record.result}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>
        )}
      </Panel>
      {selected && (
        <Dialog open onClose={() => setSelected(null)} fullWidth maxWidth="lg">
          <DialogTitle>{selected.api} event details</DialogTitle>
          <DialogContent dividers>
            <Box className="two-col">
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  Event sent
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selected.method} {selected.request.url}
                </Typography>
                <Box component="pre" sx={{ mt: 1, mb: 0, p: 2, maxHeight: 420, overflow: "auto", bgcolor: "#102c2a", color: "#dcefe9", borderRadius: 1, fontSize: 12 }}>
                  {JSON.stringify(selected.request.body ?? {}, null, 2)}
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>
                  Event received
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selected.statusCode || "Network error"} | {selected.responseTime} ms
                </Typography>
                <Box component="pre" sx={{ mt: 1, mb: 0, p: 2, maxHeight: 420, overflow: "auto", bgcolor: "#102c2a", color: "#dcefe9", borderRadius: 1, fontSize: 12 }}>
                  {JSON.stringify(selected.response, null, 2)}
                </Box>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => navigator.clipboard.writeText(JSON.stringify({ request: selected.request, response: selected.response }, null, 2))}>
              Copy details
            </Button>
            <Button onClick={() => setSelected(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}
function AnalyticsView() {
  const [emailStatus, setEmailStatus] = useState("");
  const metrics = useRunStore((state) => state.metrics);
  const environmentUrl = useRunStore((state) => state.environmentUrl);
  const setEnvironmentUrl = useRunStore((state) => state.setEnvironmentUrl);
  const [records, setRecords] = useState<CapturedResponse[]>([]);
  useEffect(() => {
    fetch(`${apiBase}/api/responses`)
      .then((response) => response.json())
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [metrics]);
  const liveTrend = records
    .slice(0, 30)
    .reverse()
    .map((record) => ({
      time: new Date(record.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      response: record.responseTime,
      tps: metrics.tps,
    }));
  const responseTimes = records
    .map((record) => record.responseTime)
    .sort((left, right) => left - right);
  const percentile = (percent: number) =>
    responseTimes.length
      ? responseTimes[Math.min(responseTimes.length - 1, Math.ceil(responseTimes.length * percent) - 1)]
      : 0;
  const slowApis = [...records]
    .sort((left, right) => right.responseTime - left.responseTime)
    .slice(0, 4);
  const successRate =
    metrics.totalRequests > 0
      ? ((metrics.success / metrics.totalRequests) * 100).toFixed(1)
      : "0.0";
  const sendEmail = async () => {
    setEmailStatus("Sending...");
    try {
      const response = await fetch(`${apiBase}/api/reports/analytics/email`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEmailStatus(result.message);
    } catch (error) {
      setEmailStatus(
        error instanceof Error
          ? error.message
          : "Analytics email could not be sent.",
      );
    }
  };
  return (
    <Stack gap={2.5}>
      <Box>
        <Typography variant="h4">Analytics dashboard</Typography>
        <Typography color="text.secondary">
          Performance signals across the selected execution window.
        </Typography>
      </Box>
      <Box className="filters">
        <Select defaultValue="LT-2026-084" size="small">
          <MenuItem value="LT-2026-084">Run LT-2026-084</MenuItem>
        </Select>
        <Select defaultValue="All APIs" size="small">
          <MenuItem value="All APIs">All APIs</MenuItem>
        </Select>
        <Select
          value={environmentUrl}
          size="small"
          onChange={(event) => setEnvironmentUrl(event.target.value)}
        >
          {targetEnvironments.map((target) => (
            <MenuItem key={target} value={target}>
              {environmentLabels[target]} ({target})
            </MenuItem>
          ))}
        </Select>
        <Button variant="outlined">Last 24 hours</Button>
        <Button
          variant="contained"
          onClick={sendEmail}
          disabled={emailStatus === "Sending..."}
        >
          Send via Outlook
        </Button>
      </Box>
      {emailStatus && (
        <Alert
          severity={
            emailStatus.includes("sent")
              ? "success"
              : emailStatus === "Sending..."
                ? "info"
                : "error"
          }
        >
          {emailStatus}
        </Alert>
      )}
      <Box className="metric-grid">
        <Metric label="TOTAL REQUESTS" value={metrics.totalRequests.toLocaleString()} />
        <Metric label="SUCCESS" value={`${successRate}%`} />
        <Metric label="FAILURE" value={`${metrics.failed.toLocaleString()}`} />
        <Metric label="AVG RESPONSE" value={`${metrics.avgResponse} ms`} />
        <Metric label="P95" value={`${percentile(0.95)} ms`} />
        <Metric label="P99" value={`${percentile(0.99)} ms`} />
        <Metric label="CURRENT TPS" value={metrics.tps} />
        <Metric label="ACTIVE USERS" value={metrics.activeUsers} />
      </Box>
      <Box className="two-col">
        <Panel title="Response time trend">
          <Box height={260}>
            <ResponsiveContainer>
              <AreaChart data={liveTrend}>
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Area
                  dataKey="response"
                  type="monotone"
                  stroke="#087f8c"
                  fill="#b8dfd9"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Panel>
        <Panel title="Success vs failure">
          <Box height={260}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={[
                    { name: "Success", value: metrics.success },
                    { name: "Failure", value: metrics.failed },
                  ]}
                  dataKey="value"
                  innerRadius={55}
                  outerRadius={90}
                >
                  {[0, 1].map((index) => (
                    <Cell key={index} fill={index ? "#e66a32" : "#158a55"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Panel>
      </Box>
      <Box className="two-col">
        <Panel title="Requests per second">
          <Box height={260}>
            <ResponsiveContainer>
              <BarChart data={liveTrend}>
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tps" fill="#087f8c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Panel>
        <Panel title="Top slow APIs">
          <Stack gap={1.5}>
            {slowApis.length ? (
              slowApis.map((record) => (
                <Box className="slow-row" key={record.id}>
                  <Typography>{`${record.method} ${new URL(record.request.url).pathname}`}</Typography>
                  <Chip color="warning" label={`${record.responseTime} ms`} size="small" />
                </Box>
              ))
            ) : (
              <Typography color="text.secondary">Run APIs to view measured response times.</Typography>
            )}
          </Stack>
        </Panel>
      </Box>
    </Stack>
  );
}
function ImportView() {
  const [message, setMessage] = useState("");
  const [showJmeterApis, setShowJmeterApis] = useState(false);
  const [showImportedUsers, setShowImportedUsers] = useState(false);
  const [jmeterImport, setJmeterImport] = useState<{
    count: number;
    threadGroups: number;
    apis: ImportedApi[];
  } | null>(null);
  const [userImport, setUserImport] = useState<{
    total: number;
    records: { email_id: string; password: string; app_token: string }[];
  } | null>(null);
  const setWorkspace = useRunStore((state) => state.setWorkspace);
  const importedApis = useRunStore((state) => state.importedApis);
  const setImportedApis = useRunStore((state) => state.setImportedApis);
  const importFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${apiBase}/api/import/${kind}`, {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    setMessage(response.ok ? `${file.name}: ${data.message}` : data.error);
    if (!response.ok) return;
    if (kind === "jmeter") {
      setJmeterImport(data);
      setShowJmeterApis(false);
      setWorkspace({ apiCount: data.count });
      setImportedApis(data.apis);
    }
    if (kind === "users") {
      setUserImport(data);
      setShowImportedUsers(false);
      setWorkspace({ userCount: data.total });
    }
  };
  return (
    <Stack gap={2.5}>
      <Box>
        <Typography variant="h4">Import center</Typography>
        <Typography color="text.secondary">
          Bring JMeter plans and credential pools into the workspace.
        </Typography>
      </Box>
      {message && <Alert severity="info">{message}</Alert>}
      <Box className="two-col">
        <Panel title="JMeter test plan">
          <Typography color="text.secondary" mb={2}>
            Upload a `.jmx` file to extract thread groups, controllers, HTTP
            requests, headers, and variables.
          </Typography>
          <Button
            component="label"
            variant="contained"
            startIcon={<CloudUpload />}
          >
            Import JMeter file
            <input
              hidden
              type="file"
              accept=".jmx"
              onChange={(event) => importFile(event, "jmeter")}
            />
          </Button>
          <Divider sx={{ my: 3 }} />
          <Box className="import-stat">
            {jmeterImport?.count ? (
              <Button
                aria-expanded={showJmeterApis}
                onClick={() => setShowJmeterApis((isOpen) => !isOpen)}
                sx={{ minWidth: 0, p: 0, fontSize: "inherit", fontWeight: 700 }}
              >
                {jmeterImport.count}
              </Button>
            ) : (
              <b>0</b>
            )}
            <span>APIs discovered</span>
          </Box>
          <Box className="import-stat">
            <b>{jmeterImport?.threadGroups ?? 0}</b>
            <span>Thread groups</span>
          </Box>
          {jmeterImport && showJmeterApis && (
            <Box component="ul" sx={{ pl: 2.5, mb: 0 }}>
              {jmeterImport.apis.map((api, index) => (
                <Typography component="li" key={`${api}-${index}`}>
                  {api.method} {api.name}
                </Typography>
              ))}
            </Box>
          )}
        </Panel>
        <Panel title="User credentials">
          <Typography color="text.secondary" mb={2}>
            Import CSV, TXT, or Excel fields in `email_id,password,app_token`
            format. Credentials stay encrypted at rest.
          </Typography>
          <Button
            component="label"
            variant="contained"
            color="secondary"
            startIcon={<CloudUpload />}
          >
            Import users
            <input
              hidden
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={(event) => importFile(event, "users")}
            />
          </Button>
          <Divider sx={{ my: 3 }} />
          <Box className="import-stat">
            {userImport?.total ? (
              <Button
                aria-expanded={showImportedUsers}
                onClick={() => setShowImportedUsers((isOpen) => !isOpen)}
                sx={{ minWidth: 0, p: 0, fontSize: "inherit", fontWeight: 700 }}
              >
                {userImport.total}
              </Button>
            ) : (
              <b>0</b>
            )}
            <span>Total users</span>
          </Box>
          {userImport && showImportedUsers && (
            <Box component="table" className="data-table" sx={{ mt: 2 }}>
              <thead>
                <tr>
                  <th>EMAIL ID</th>
                  <th>PASSWORD</th>
                  <th>APP TOKEN</th>
                </tr>
              </thead>
              <tbody>
                {userImport.records.map((user, index) => (
                  <tr key={`${user.email_id}-${index}`}>
                    <td>{user.email_id}</td>
                    <td>{user.password}</td>
                    <td>{user.app_token}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          )}
        </Panel>
      </Box>
      <Panel title="Discovered API inventory">
        {importedApis.length === 0 ? (
          <Typography color="text.secondary">
            Import a JMeter test plan to view its discovered API requests.
          </Typography>
        ) : (
          <Box component="table" className="data-table">
            <thead>
              <tr>
                <th>API</th>
                <th>METHOD</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {importedApis.map((api, index) => (
                <tr key={`${api.name}-${api.url}-${index}`}>
                  <td>{api.name}</td>
                  <td>{api.method}</td>
                  <td>{api.url}</td>
                </tr>
              ))}
            </tbody>
          </Box>
        )}
      </Panel>
    </Stack>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <Stack gap={2}>
      <Typography variant="h4">{title}</Typography>
      <Paper className="empty">
        <Assessment color="primary" sx={{ fontSize: 46 }} />
        <Typography variant="h6">Workspace ready</Typography>
        <Typography color="text.secondary">
          Use the navigation to configure a test, import data, or inspect
          execution analytics.
        </Typography>
      </Paper>
    </Stack>
  );
}
function MetricsListener() {
  useEffect(() => {
    const socket = io(apiBase, { autoConnect: true });
    socket.on("metrics", useRunStore.getState().setMetrics);
    return () => {
      socket.close();
    };
  }, []);
  return null;
}
function App() {
  const [view, setView] = useState("Dashboard");
  const metrics = useRunStore((state) => state.metrics);
  const environmentUrl = useRunStore((state) => state.environmentUrl);
  const setMetrics = useRunStore((state) => state.setMetrics);
  const setWorkspace = useRunStore((state) => state.setWorkspace);
  const setImportedApis = useRunStore((state) => state.setImportedApis);
  useEffect(() => {
    const showDashboard = () => setView("Dashboard");
    window.addEventListener("show-dashboard-for-report", showDashboard);
    return () => window.removeEventListener("show-dashboard-for-report", showDashboard);
  }, []);
  useEffect(() => {
    fetch(`${apiBase}/api/workspace/reset`, { method: "POST" })
      .then(() => {
        setMetrics({ activeUsers: 0, totalRequests: 0, success: 0, failed: 0, tps: 0, avgResponse: 0, status: "Idle" });
        setWorkspace({ apiCount: 0, userCount: 0 });
          setImportedApis([]);
      })
      .catch(() => undefined);
        }, [setImportedApis, setMetrics, setWorkspace]);
  const page =
    view === "Dashboard" ? (
      <DashboardView />
    ) : view === "Single API Runner" ? (
      <RunnerView />
    ) : view === "Run All APIs" ? (
      <RunAllView />
    ) : view === "API Response Viewer" ? (
      <ResponseViewerView />
    ) : view === "Analytics Dashboard" ? (
      <AnalyticsView />
    ) : view === "Import Center" ? (
      <ImportView />
    ) : view === "Reports" ? (
      <ReportsView />
    ) : (
      <Placeholder title={view} />
    );
  return (
    <Box className="app-shell">
      <MetricsListener />
      <AppBar className="topbar" position="fixed" elevation={0}>
        <Toolbar>
          <Typography className="brand" variant="h6">
            WISER <span>Load Testing Suite</span>
          </Typography>
          <Box flexGrow={1} />
          <Chip className="environment" size="small" label={environmentLabels[environmentUrl as (typeof targetEnvironments)[number]]} />
          <Box className="top-stat">
            <span>RUN STATUS</span>
            <b className={metrics.status === "Running" ? "green" : ""}>
              {metrics.status}
            </b>
          </Box>
          <Box className="top-stat">
            <span>ACTIVE USERS</span>
            <b>{metrics.activeUsers}</b>
          </Box>
          <Box className="top-stat">
            <span>TPS</span>
            <b>{metrics.tps}</b>
          </Box>
          <Box className="top-stat">
            <span>AVG RESPONSE</span>
            <b>{metrics.avgResponse} ms</b>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer className="drawer" variant="permanent">
        <Toolbar />
        <Box className="nav-brand">WORKSPACE</Box>
        <List>
          {nav.map(([label, Icon]) => (
            <ListItemButton
              key={label}
              selected={view === label}
              onClick={() => setView(label)}
            >
              <ListItemIcon>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
        <Box flexGrow={1} />
        <Box className="engine-status">
          <span className="led" /> Engine connected
          <br />
          <small>v1.0.0</small>
        </Box>
      </Drawer>
      <Box component="main" className="content">
        <Toolbar />
        {page}
      </Box>
    </Box>
  );
}
export default App;
