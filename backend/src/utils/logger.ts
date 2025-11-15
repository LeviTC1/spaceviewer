/**
 * Formats the current date/time so log entries are easy to scan at a glance.
 */
const formatTimestamp = (): string => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

/**
 * Basic logger used across the backend. Optional data is serialized for context.
 */
const log = (message: string, data?: unknown) => {
  const suffix = typeof data !== "undefined" ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${formatTimestamp()}] INFO: ${message}${suffix}`);
};

export default log;
export { formatTimestamp };
