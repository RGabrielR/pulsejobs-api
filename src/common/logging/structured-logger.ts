type LogLevel = 'INFO' | 'ERROR';

function write(level: LogLevel, event: string, payload: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload,
  };

  const serialized = JSON.stringify(entry);
  if (level === 'ERROR') {
    process.stderr.write(`${serialized}\n`);
    return;
  }

  process.stdout.write(`${serialized}\n`);
}

export function logInfo(event: string, payload: Record<string, unknown>): void {
  write('INFO', event, payload);
}

export function logError(event: string, payload: Record<string, unknown>): void {
  write('ERROR', event, payload);
}
