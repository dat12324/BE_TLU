export function createHealthController(isDatabaseConnected) {
  return (_req, res) => {
    const connected = isDatabaseConnected();
    res.status(connected ? 200 : 503).json({
      status: connected ? "ok" : "unavailable",
      database: connected ? "connected" : "disconnected",
    });
  };
}
