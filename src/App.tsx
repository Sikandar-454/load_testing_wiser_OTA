import { memo, useEffect, useState } from "react";
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
import { utils as spreadsheetUtils } from "xlsx";

type Metrics = {
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
const useRunStore = create<{
  metrics: Metrics;
  setMetrics: (metrics: Metrics) => void;
  connected: boolean;
  setConnected: (connected: boolean) => void;
}>((set) => ({
  metrics: {
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
  },
  setMetrics: (metrics) => set((state) => ({ metrics: { ...state.metrics, ...metrics } })),
  connected: false,
  setConnected: (connected) => set({ connected }),
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
type DashboardData = {
  metrics: Metrics;
  usersLoaded: number;
  recentRuns: { id: string; api: string; mode: string; requests: number; result: string; timestamp: string }[];
  activity: { timestamp: string; message: string }[];
  trend: { timestamp: string; response: number; tps: number; cpu: number; memory: number }[];
  utilization: { cpu: number; memory: number };
};
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
  window.location.protocol === "file:" ? "http://localhost:3002" : "";
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
const ResponseTrendChart = memo(function ResponseTrendChart({ data }: { data: DashboardData["trend"] }) {
  return (
    <Box height={260}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="response" x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#087f8c" stopOpacity=".32" />
              <stop offset="1" stopColor="#087f8c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e6ecea" />
          <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString()} />
          <YAxis yAxisId="response" />
          <YAxis yAxisId="tps" orientation="right" />
          <Tooltip />
          <Area yAxisId="response" name="Average response (ms)" type="monotone" dataKey="response" stroke="#087f8c" fill="url(#response)" strokeWidth={2.5} />
          <Area yAxisId="tps" name="Requests/sec" type="monotone" dataKey="tps" stroke="#e66a32" fill="transparent" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
});
const SystemUtilizationChart = memo(function SystemUtilizationChart({ data }: { data: DashboardData["trend"] }) {
  return (
    <Box height={220}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString()} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="cpu" name="Process CPU (%)" fill="#e66a32" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
});

function DashboardView() {
  const metrics = useRunStore((state) => state.metrics);
  const setMetrics = useRunStore((state) => state.setMetrics);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`${apiBase}/api/dashboard`, { signal: controller.signal });
        if (!response.ok) throw new Error("Dashboard data could not be loaded.");
        const snapshot: DashboardData = await response.json();
        if (controller.signal.aborted) return;
        setData(snapshot);
        setMetrics(snapshot.metrics);
        setError("");
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Dashboard data could not be loaded.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 2000);
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [setMetrics]);
  const successRate = metrics.totalRequests ? `${((metrics.success / metrics.totalRequests) * 100).toFixed(1)}%` : "-";
  return (
    <Stack gap={2.5}>
      <Box>
        <Typography variant="h4">Operations overview</Typography>
        <Typography color="text.secondary">
          Live health for the WISER API test estate.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Box className="metric-grid">
        <Metric label="APIs CONFIGURED" value={suiteApis.length} sub="Available in execution plan" />
        <Metric
          label="USERS LOADED"
          value={data ? data.usersLoaded.toLocaleString() : "-"}
          sub="Imported credentials"
        />
        <Metric
          label="ACTIVE TESTS"
          value={metrics.activeTests}
          sub={metrics.status}
        />
        <Metric
          label="REQUESTS EXECUTED"
          value={metrics.totalRequests.toLocaleString()}
          sub="Since engine start"
        />
        <Metric
          label="SUCCESS RATE"
          value={successRate}
          sub={`${metrics.success.toLocaleString()} successful`}
        />
        <Metric
          label="AVG RESPONSE"
          value={`${metrics.avgResponse} ms`}
          sub={`P95 ${metrics.p95} ms`}
        />
        <Metric label="CURRENT TPS" value={metrics.tps} sub={`Peak ${metrics.peakTps} TPS`} />
        <Metric
          label="PEAK RESPONSE"
          value={`${metrics.peakResponse} ms`}
          sub="Measured endpoint latency"
        />
      </Box>
      <Box className="two-col">
        <Panel title="Response time and throughput">
          {metrics.totalRequests ? <ResponseTrendChart data={data?.trend ?? []} /> : <Typography color="text.secondary">No requests executed yet.</Typography>}
        </Panel>
        <Panel
          title="Live activity"
          action={<Chip size="small" color={data && !error ? "success" : "default"} label={error ? "DISCONNECTED" : data ? "CONNECTED" : "CONNECTING"} />}
        >
          <Stack className="feed" divider={<Divider flexItem />}>
            {data?.activity.length ? data.activity.slice(0, 5).map((item, index) => (
              <Typography key={`${item.timestamp}-${index}`}><b>{new Date(item.timestamp).toLocaleTimeString()}</b> &nbsp; {item.message}</Typography>
            )) : <Typography color="text.secondary">No activity recorded yet.</Typography>}
          </Stack>
        </Panel>
      </Box>
      <Box className="two-col">
        <Panel title="Recent runs">
          <RunTable runs={data?.recentRuns ?? []} />
        </Panel>
        <Panel title="Engine process utilization">
          <SystemUtilizationChart data={data?.trend ?? []} />
          <Stack direction="row" gap={1}>
            <Chip label={data ? `CPU ${data.utilization.cpu}%` : "CPU -"} />
            <Chip label={data ? `Memory ${data.utilization.memory} MB` : "Memory -"} />
            <Chip label={error ? "Engine unavailable" : data ? "Engine healthy" : "Connecting"} color={data && !error ? "success" : "default"} />
          </Stack>
        </Panel>
      </Box>
    </Stack>
  );
}
function RunTable({ runs }: { runs: DashboardData["recentRuns"] }) {
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
        {runs.length ? runs.slice(0, 5).map((run) => (
          <tr key={run.id}>
            <td>{run.id}<Typography variant="caption" display="block">{run.api}</Typography></td>
            <td>{run.mode}</td><td>{run.requests}</td>
            <td><Chip size="small" color={run.result === "Success" ? "success" : "error"} label={run.result} /></td>
          </tr>
        )) : <tr><td colSpan={4}>No runs recorded yet.</td></tr>}
      </tbody>
    </Box>
  );
}
function RunnerView() {
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const setMetrics = useRunStore((state) => state.setMetrics);
  const start = async () => {
    setRunning(true);
    setNotice("");
    try {
      const response = await fetch(`${apiBase}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api: "User Login",
          virtualUsers: 50,
          mode: "Load",
          request: {
            url: "https://api.wiser-support.se.app/v1/user/login",
            method: "POST",
            body: {
              email_id: "{email_id}",
              password: "{password}",
              app_token: "{app_token}",
            },
          },
        }),
      });
      const run = await response.json();
      if (!response.ok)
        throw new Error(run.error || "The API request could not start.");
      setMetrics(run.metrics);
      setNotice(`Run ${run.id} started using imported user credentials.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The API request could not start.",
      );
    } finally {
      setRunning(false);
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
            <TextField select label="API" defaultValue="login" fullWidth>
              <MenuItem value="login">User Login</MenuItem>
              <MenuItem value="register">User Register</MenuItem>
              <MenuItem value="verify">User Verify</MenuItem>
              <MenuItem value="logout">User Logout</MenuItem>
              <MenuItem value="validate">Validate User</MenuItem>
              <MenuItem value="oauth-token">OAuth Token</MenuItem>
              <MenuItem value="password">User Password</MenuItem>
              <MenuItem value="forgot">Forgot Password</MenuItem>
              <MenuItem value="status">User Status</MenuItem>
              <MenuItem value="reset-password">Reset Password</MenuItem>
              <MenuItem value="resend-email">Resend Email</MenuItem>
              <MenuItem value="update-user">Update User</MenuItem>
              <MenuItem value="locations">Get Locations</MenuItem>
              <MenuItem value="devices">Device State</MenuItem>
            </TextField>
            <Box display="grid" gridTemplateColumns="120px 1fr" gap={1.5}>
              <TextField select label="Method" defaultValue="POST">
                <MenuItem value="POST">POST</MenuItem>
                <MenuItem value="GET">GET</MenuItem>
              </TextField>
              <TextField
                label="Base URL"
                defaultValue="https://api.wiser-support.se.app"
              />
            </Box>
            <TextField label="Endpoint" defaultValue="/v1/user/login" />
            <TextField
              label="Request body (JSON)"
              multiline
              minRows={8}
              defaultValue={
                '{\n  "email_id": "{email_id}",\n  "password": "{password}",\n  "app_token": "{app_token}"\n}'
              }
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
                defaultValue="50"
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
                disabled={running}
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
                onClick={() => setRunning(false)}
              >
                Stop API
              </Button>
            </Stack>
          </Panel>
          <Panel title="Live metrics">
            <Box className="mini-metrics">
              <Metric label="REQUESTS" value="2,480" />
              <Metric label="SUCCESS" value="2,431" />
              <Metric label="FAILURES" value="49" />
              <Metric label="P95" value="612 ms" />
            </Box>
          </Panel>
        </Stack>
      </Box>
      <Panel
        title="Live request log"
        action={<Chip size="small" label="Auto-scroll" />}
      >
        <ResponseTable />
      </Panel>
    </Stack>
  );
}
function ResponseTable() {
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
        {responses.map((row) => (
          <tr key={`${row.time}-${row.user}`}>
            <td>{row.time}</td>
            <td>{row.api}</td>
            <td>{row.user}</td>
            <td>{row.method}</td>
            <td>{row.code}</td>
            <td>{row.duration} ms</td>
            <td>
              <Chip
                size="small"
                color={
                  row.result === "Success"
                    ? "success"
                    : row.result === "Failure"
                      ? "error"
                      : "warning"
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
      verifyForgotCode: "{verify_forgot_code}",
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
      code: "{code}",
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
  { name: "Federated Id Map", url: "https://api.wiser-support.se.app/v1/user/federatedId/map", method: "POST", body: { user_id: "{user_id}", federated_id: "{federated_id}" } },
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
  { name: "Location Devices", url: "https://api.wiser-support.se.app/v1/location/device/{location_id}/get", method: "GET", headers: { locationId: "{location_id}" } },
  { name: "All Location Devices", url: "https://api.wiser-support.se.app/v1/location/device/{location_id}/all", method: "GET", headers: { locationId: "{location_id}" } },
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
  { name: "Add Device To Hub", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/add", method: "POST", body: { hubId: "{hub_id}", device_name: "Device 1", app_token: "{app_token}" } },
  { name: "Get Devices By Hub", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/get", method: "GET" },
  { name: "Get Device By Hub", url: "https://api.wiser-support.se.app/v1/device/{hub_id}/get/{device_id}", method: "GET" },
  { name: "Update Device By Hub", url: "https://api.wiser-support.se.app/v1/device/{hub_id}/update/{device_id}", method: "POST", body: { hubId: "{hub_id}", deviceId: "{device_id}", device_name: "Updated Device", status: "active" } },
  { name: "Delete Device By Hub", url: "https://api.wiser-support.se.app/v1/devices/{hub_id}/delete/{device_id}", method: "POST", body: { hubId: "{hub_id}", deviceId: "{device_id}", reason: "test-delete" } },
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
  { name: "AIML Post Tip Action", url: "https://api.wiser-support.se.app/v1/aiml/posttipaction", method: "POST", headers: { user_id: "{user_id}" }, body: { msgId: "{msg_id}", action_reason: "{action_reason}" } },
  { name: "Recommendation Get All", url: "https://api.wiser-support.se.app/v1/aimlrecom/getallrecommendation", method: "GET" },
  { name: "Recommendation Post Action", url: "https://api.wiser-support.se.app/v1/aimlrecom/postrecomaction", method: "POST", body: { action: "accept" } },
];
function RunAllView() {
  const [selected, setSelected] = useState(suiteApis.map((api) => api.name));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [executionMode, setExecutionMode] = useState("Parallel");
  const [concurrency, setConcurrency] = useState(5);
  const [logs, setLogs] = useState<
    { api: string; status: string; duration?: number; detail?: string }[]
  >([]);
  const setMetrics = useRunStore((state) => state.setMetrics);
  const toggle = (api: string) =>
    setSelected((items) =>
      items.includes(api)
        ? items.filter((item) => item !== api)
        : [...items, api],
    );
  const runAll = async () => {
    setRunning(true);
    setError("");
    setLogs(selected.map((api) => ({ api, status: "Queued" })));
    let blocked = false;
    const executeApi = async (name: string) => {
      if (blocked) return;
      const api = suiteApis.find((item) => item.name === name)!;
      if (!api.url) {
        setLogs((items) =>
          items.map((item) =>
            item.api === name
              ? {
                  ...item,
                  status: "Needs endpoint",
                  detail:
                    "This API requires the JMeter authentication flow and an access token. Imported JMeter samplers are not yet run by this view.",
                }
              : item,
          ),
        );
        return;
      }
      setLogs((items) =>
        items.map((item) =>
          item.api === name ? { ...item, status: "Running" } : item,
        ),
      );
      try {
        const response = await fetch(`${apiBase}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api: name,
            virtualUsers: 25,
            mode: executionMode,
            request: api,
          }),
          signal: AbortSignal.timeout(90000),
        });
        const run = await response.json();
        if (response.status === 400) {
          blocked = true;
          const message = run.error || "Check the run configuration before retrying.";
          setError(message);
          setLogs((items) =>
            items.map((item) =>
              item.status === "Queued" || item.api === name
                ? { ...item, status: "Blocked", detail: message }
                : item,
            ),
          );
          return;
        }
        if (!response.ok) throw new Error(run.error);
        setMetrics(run.metrics);
        const payload = run.response.response;
        const failureReason = payload && typeof payload === "object"
          ? [payload.message, payload.error, payload.detail].find(
              (value) => typeof value === "string" && value.length > 0,
            ) || (payload.msg_count === 0 ? "No matching report or event data was returned (msg_count: 0)." : undefined)
          : undefined;
        setLogs((items) =>
          items.map((item) =>
            item.api === name
              ? {
                  ...item,
                  status: run.response.result,
                  duration: run.response.responseTime,
                  detail: run.response.result === "Failure"
                    ? `${run.response.statusCode ? `HTTP ${run.response.statusCode}` : "Request error"}: ${failureReason || (run.response.statusCode === 404 ? "Endpoint or resource not found; verify the API route and configured IDs." : "Inspect the captured response in API Response Viewer.")}`
                    : undefined,
                }
              : item,
          ),
        );
      } catch (error) {
        setLogs((items) =>
          items.map((item) =>
            item.api === name
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
    };
    const limit = executionMode === "Sequential" ? 1 : Math.max(1, Math.min(20, Math.floor(concurrency) || 1));
    const canRunConcurrently = (name: string) => {
      const api = suiteApis.find((item) => item.name === name)!;
      return api.method === "GET" && !/\/(?:logout|verify|validate|activate)(?:\/|$)/.test(api.url);
    };
    try {
      let next = 0;
      while (next < selected.length && !blocked) {
        if (limit === 1 || !canRunConcurrently(selected[next])) {
          await executeApi(selected[next++]);
          continue;
        }
        const batch: string[] = [];
        while (next < selected.length && batch.length < limit && canRunConcurrently(selected[next]))
          batch.push(selected[next++]);
        await Promise.all(batch.map(executeApi));
      }
    } finally {
      setRunning(false);
    }
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
      {error && <Alert severity="error">{error}</Alert>}
      <Box className="runner-grid">
        <Panel
          title="API execution plan"
          action={
            <Button
              size="small"
              disabled={running}
              onClick={() =>
                setSelected(
                  selected.length === suiteApis.length
                    ? []
                    : suiteApis.map((api) => api.name),
                )
              }
            >
              Select all
            </Button>
          }
        >
          <Stack gap={0.5}>
            {suiteApis.map((api) => (
              <ListItemButton
                key={api.name}
                disabled={running}
                onClick={() => toggle(api.name)}
                selected={selected.includes(api.name)}
              >
                <ListItemIcon>
                  <input
                    type="checkbox"
                    checked={selected.includes(api.name)}
                    readOnly
                  />
                </ListItemIcon>
                <ListItemText
                  primary={api.name}
                  secondary={
                    api.url
                      ? `${api.method} ${api.url}`
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
                label="Execution mode"
                value={executionMode}
                onChange={(event) => setExecutionMode(event.target.value)}
                disabled={running}
              >
                <MenuItem value="Sequential">Sequential</MenuItem>
                <MenuItem value="Parallel">Parallel</MenuItem>
                <MenuItem value="Stress">Stress</MenuItem>
              </TextField>
              <TextField
                label="Concurrent API requests"
                type="number"
                value={concurrency}
                onChange={(event) => setConcurrency(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
                inputProps={{ min: 1, max: 20, step: 1 }}
                disabled={running || executionMode === "Sequential"}
              />
              <TextField
                label="Virtual users"
                type="number"
                defaultValue="25"
              />
              <TextField label="Loop count" type="number" defaultValue="10" />
              <TextField
                label="Ramp up (sec)"
                type="number"
                defaultValue="15"
              />
            </Box>
          </Panel>
          <Panel title="Suite controls">
            <Stack direction="row" gap={1}>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                disabled={running || !selected.length}
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
                <tr key={log.api}>
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
      </Panel>
    </Stack>
  );
}
type ReportData = {
  generatedAt: string;
  runId: string | null;
  recordLimit: number;
  captured: number;
  blocked: number;
  totalRequests: number;
  success: number;
  failed: number;
  avgResponse: number | null;
  p95: number | null;
  peakTps: number;
  users: number;
  hosts: string[];
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  apis: { api: string; requests: number; success: number; failed: number; avgResponse: number; p95: number }[];
  runs: { id: string; api: string; mode: string; timestamp: string }[];
};
function ReportsView() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [runId, setRunId] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    setLoading(true);
    setReport(null);
    setMessage("");
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`${apiBase}/api/reports/summary${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Report data could not be loaded.");
        setReport(data);
        setError("");
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Report data could not be loaded.");
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [runId]);
  const rate = (count: number, total: number) => total ? `${((count / total) * 100).toFixed(1)}%` : "-";
  const milliseconds = (value: number | null | undefined) => value == null ? "-" : `${value} ms`;
  const selectedRun = report?.runs.find((run) => run.id === runId);
  const exportCsv = () => {
    if (!report || !report.captured || error || loading) return;
    const safeText = (value: string) => /^[=+@\-\t\r\n]/.test(value) ? `'${value}` : value;
    const rows = [
      ["Scope", runId || "All retained captures"],
      ["Generated at", report.generatedAt],
      ["Capture limit", report.recordLimit],
      ["Captured attempts", report.captured],
      ["Executed requests", report.totalRequests],
      ["Successful requests", report.success],
      ["Failed requests", report.failed],
      ["Blocked before execution", report.blocked],
      ["Success rate", rate(report.success, report.totalRequests)],
      ["Average response (ms)", report.avgResponse ?? ""],
      ["P95 response (ms)", report.p95 ?? ""],
      ["Peak TPS", report.peakTps],
      ["Users executed", report.users],
      ["Started at", report.startedAt ?? ""],
      ["Ended at", report.endedAt ?? ""],
      ["Capture window (ms)", report.durationMs],
      ["Hosts", report.hosts.join(", ")],
      [],
      ["API", "Requests", "Success rate", "Average (ms)", "P95 (ms)", "Failure rate"],
      ...report.apis.map((api) => [safeText(api.api), api.requests, rate(api.success, api.requests), api.avgResponse, api.p95, rate(api.failed, api.requests)]),
    ];
    const csv = spreadsheetUtils.sheet_to_csv(spreadsheetUtils.aoa_to_sheet(rows));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `WISER-report-${runId || "captured"}-${report.generatedAt.replace(/[:.]/g, "-")}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
    setMessage("CSV report downloaded.");
  };
  return (
    <Stack gap={2.5}>
      <Box display="flex" justifyContent="space-between" alignItems="end">
        <Box>
          <Typography variant="h4">Reports</Typography>
          <Typography color="text.secondary">
            {loading ? "Loading report..." : report ? `${report.captured.toLocaleString()} captured attempts` : "Report data unavailable."}
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" onClick={exportCsv} disabled={loading || !!error || !report?.captured}>
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
      <TextField
        select
        label="Run"
        value={runId}
        onChange={(event) => setRunId(event.target.value)}
        disabled={loading}
        size="small"
        sx={{ maxWidth: 480 }}
      >
        <MenuItem value="">All retained captures</MenuItem>
        {!!runId && !report?.runs.some((run) => run.id === runId) && <MenuItem value={runId}>{runId}</MenuItem>}
        {report?.runs.map((run) => <MenuItem key={run.id} value={run.id}>{run.id} / {run.api}</MenuItem>)}
      </TextField>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <Box className="metric-grid">
        <Metric
          label="REPORT SCOPE"
          value={runId || "Retained captures"}
          sub={selectedRun?.mode || (report ? `${report.captured.toLocaleString()} attempts` : undefined)}
        />
        <Metric label="TOTAL REQUESTS" value={report?.totalRequests.toLocaleString() ?? "-"} sub={report ? `${report.users} users executed` : undefined} />
        <Metric label="SUCCESS RATE" value={report ? rate(report.success, report.totalRequests) : "-"} sub={report ? `${report.success.toLocaleString()} successful` : undefined} />
        <Metric label="AVG RESPONSE" value={milliseconds(report?.avgResponse)} sub={`P95: ${milliseconds(report?.p95)}`} />
        <Metric label="PEAK TPS" value={report?.peakTps ?? "-"} sub="Within captured requests" />
        <Metric label="FAILURES" value={report?.failed.toLocaleString() ?? "-"} sub={report ? rate(report.failed, report.totalRequests) : undefined} />
        <Metric label="CAPTURE WINDOW" value={report?.startedAt ? `${(report.durationMs / 1000).toFixed(1)} s` : "-"} sub={report?.startedAt ? new Date(report.startedAt).toLocaleString() : undefined} />
        <Metric label="TARGET HOSTS" value={report?.hosts.length ?? "-"} sub={report?.hosts.join(", ") || undefined} />
      </Box>
      <Box className="two-col">
        <Panel title="Execution summary">
          <Stack gap={1.5}>
            <Typography>
              {report ? `${report.totalRequests.toLocaleString()} executed requests: ${report.success.toLocaleString()} successful, ${report.failed.toLocaleString()} failed.` : "No report data available."}
            </Typography>
            <Typography color="text.secondary">
              {report ? `${report.blocked.toLocaleString()} attempts were blocked before endpoint execution.` : "-"}
            </Typography>
            {!!report?.failed && <Alert severity="warning">{report.failed.toLocaleString()} executed requests failed.</Alert>}
          </Stack>
        </Panel>
        <Panel title="Capture scope">
          <Stack gap={1}>
            <Typography>{report ? `Latest ${report.recordLimit.toLocaleString()} captures retained by the engine.` : "-"}</Typography>
            <Typography>Start: {report?.startedAt ? new Date(report.startedAt).toLocaleString() : "-"}</Typography>
            <Typography>End: {report?.endedAt ? new Date(report.endedAt).toLocaleString() : "-"}</Typography>
            <Typography>{report ? `${report.apis.length} APIs with executed requests` : "-"}</Typography>
          </Stack>
        </Panel>
      </Box>
      <Panel
        title="API statistics"
        action={<Chip size="small" label={loading ? "Loading" : error ? "Unavailable" : report?.captured ? "Recorded" : "No captures"} />}
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
            {report?.apis.length ? report.apis.map((api) => (
              <tr key={api.api}>
                <td>{api.api}</td>
                <td>{api.requests.toLocaleString()}</td>
                <td>{rate(api.success, api.requests)}</td>
                <td>{milliseconds(api.avgResponse)}</td>
                <td>{milliseconds(api.p95)}</td>
                <td>{rate(api.failed, api.requests)}</td>
              </tr>
            )) : <tr><td colSpan={6}>{loading ? "Loading..." : error ? "Report data unavailable." : "No executed requests recorded."}</td></tr>}
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
        <Panel
          title={`${selected.api} response`}
          action={
            <Button
              size="small"
              onClick={() =>
                navigator.clipboard.writeText(
                  JSON.stringify(selected.response, null, 2),
                )
              }
            >
              Copy response
            </Button>
          }
        >
          <Typography variant="caption" color="text.secondary">
            {selected.request.url}
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1.5,
              mb: 0,
              p: 2,
              overflow: "auto",
              bgcolor: "#102c2a",
              color: "#dcefe9",
              borderRadius: 1,
              fontSize: 12,
            }}
          >
            {JSON.stringify(selected.response, null, 2)}
          </Box>
        </Panel>
      )}
    </Stack>
  );
}
function AnalyticsView() {
  const [emailStatus, setEmailStatus] = useState("");
  const metrics = useRunStore((state) => state.metrics);
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
        <Select defaultValue="Staging" size="small">
          <MenuItem value="Staging">OTA Staging</MenuItem>
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
type ImportSummary = {
  jmeter: {
    fileName: string | null;
    apiCount: number;
    threadGroups: number;
    apis: { id: string; name: string; method: string; url: string; enabled: boolean }[];
  };
  users: { fileName: string | null; total: number; validationErrors: number; duplicates: number };
};
function ImportView() {
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"success" | "warning" | "error">("success");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/api/import/summary`, { signal: controller.signal });
        if (!response.ok) throw new Error("Import data could not be loaded.");
        setSummary(await response.json());
      } catch (error) {
        if (!controller.signal.aborted) {
          setSeverity("error");
          setMessage(error instanceof Error ? error.message : "Import data could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, []);
  const importFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setImporting(kind);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${apiBase}/api/import/${kind}`, {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed.");
      setSummary(data.summary);
      setSeverity(data.validationErrors || data.duplicates ? "warning" : "success");
      setMessage(kind === "users"
        ? `${file.name}: ${data.count} accepted, ${data.validationErrors} invalid, ${data.duplicates} duplicates.`
        : `${file.name}: ${data.message}`);
    } catch (error) {
      setSeverity("error");
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(null);
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
      {message && <Alert severity={severity}>{message}</Alert>}
      <Box className="two-col">
        <Panel title="JMeter test plan">
          <Typography color="text.secondary" mb={2}>
            {loading ? "Loading..." : summary?.jmeter.fileName || "No test plan imported."}
          </Typography>
          <Button
            component="label"
            variant="contained"
            startIcon={<CloudUpload />}
            disabled={loading || importing !== null}
          >
            {importing === "jmeter" ? "Importing..." : "Import JMeter file"}
            <input
              hidden
              type="file"
              accept=".jmx"
              onChange={(event) => importFile(event, "jmeter")}
            />
          </Button>
          <Divider sx={{ my: 3 }} />
          <Box className="import-stat">
            <b>{summary?.jmeter.apiCount.toLocaleString() ?? "-"}</b>
            <span>APIs discovered</span>
          </Box>
          <Box className="import-stat">
            <b>{summary?.jmeter.threadGroups.toLocaleString() ?? "-"}</b>
            <span>Thread groups</span>
          </Box>
        </Panel>
        <Panel title="User credentials">
          <Typography color="text.secondary" mb={2}>
            {loading ? "Loading..." : summary?.users.fileName || "No credentials imported."}
          </Typography>
          <Button
            component="label"
            variant="contained"
            color="secondary"
            startIcon={<CloudUpload />}
            disabled={loading || importing !== null}
          >
            {importing === "users" ? "Importing..." : "Import users"}
            <input
              hidden
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={(event) => importFile(event, "users")}
            />
          </Button>
          <Divider sx={{ my: 3 }} />
          <Box className="import-stat">
            <b>{summary?.users.total.toLocaleString() ?? "-"}</b>
            <span>Total users</span>
          </Box>
          <Box className="import-stat">
            <b>{summary?.users.validationErrors.toLocaleString() ?? "-"}</b>
            <span>Validation errors</span>
          </Box>
          <Box className="import-stat">
            <b>{summary?.users.duplicates.toLocaleString() ?? "-"}</b>
            <span>Duplicates</span>
          </Box>
        </Panel>
      </Box>
      <Panel title="Discovered API inventory">
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" className="data-table">
            <thead>
              <tr>
                <th>API</th>
                <th>METHOD</th>
                <th>ENDPOINT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {summary?.jmeter.apis.length ? summary.jmeter.apis.map((api) => (
                <tr key={api.id}>
                  <td>{api.name}</td>
                  <td>{api.method}</td>
                  <td>{api.url || "-"}</td>
                  <td><Chip size="small" label={api.enabled ? "Enabled" : "Disabled"} /></td>
                </tr>
              )) : (
                <tr><td colSpan={4}>{loading ? "Loading..." : summary ? "No APIs imported." : "Import data unavailable."}</td></tr>
              )}
            </tbody>
          </Box>
        </Box>
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
    socket.on("connect", () => useRunStore.getState().setConnected(true));
    socket.on("disconnect", () => useRunStore.getState().setConnected(false));
    socket.on("connect_error", () => useRunStore.getState().setConnected(false));
    return () => {
      socket.close();
      useRunStore.getState().setConnected(false);
    };
  }, []);
  return null;
}
function EngineConnection() {
  const connected = useRunStore((state) => state.connected);
  return (
    <Box className="engine-status">
      <span className="led" style={{ backgroundColor: connected ? "#158a55" : "#b54545" }} /> Engine {connected ? "connected" : "disconnected"}
    </Box>
  );
}
function LiveRunStats() {
  const metrics = useRunStore((state) => state.metrics);
  return (
    <>
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
    </>
  );
}
function App() {
  const [view, setView] = useState("Dashboard");
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
          <Chip className="environment" size="small" label="OTA STAGING" />
          <LiveRunStats />
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
        <EngineConnection />
      </Drawer>
      <Box component="main" className="content">
        <Toolbar />
        {page}
      </Box>
    </Box>
  );
}
export default App;
