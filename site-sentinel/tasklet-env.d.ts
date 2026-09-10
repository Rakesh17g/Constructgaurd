// Auto-generated — do not edit. Provides types for the Tasklet preview bridge API.

interface WriteFileResult {
  readonly ok: true;
}

interface SqlExecResult {
  readonly rowsAffected: number;
}

interface RunCommandResult {
  readonly log: string;
  readonly exitCode: number;
}

interface InvokeToolArgs {
  readonly toolName: string;
  readonly connectionId?: string;
  readonly args: unknown;
}

interface TaskletApi {
  /** Send a chat message to the agent. Fire-and-forget — resolves when queued. */
  readonly sendMessageToAgent: (message: string) => Promise<{ readonly status: string } | null>;
  /** Invoke a tool. Pass connectionId for connection tools, omit for system tools. Response is auto-parsed (see invokeTool normalization docs). */
  readonly invokeTool: (args: InvokeToolArgs) => Promise<unknown>;
  /** @deprecated Use invokeTool({ toolName, connectionId?, args }) instead. */
  readonly runTool: (toolName: string, args: unknown) => Promise<unknown>;
  /** Read a text file from disk. Returns raw string content. For directories, returns ls listing. */
  readonly readFileFromDisk: (filePath: string) => Promise<string>;
  /** @deprecated Use readBinaryFileBytesFromDisk() to avoid base64 encoding. */
  readonly readBinaryFileFromDisk: (filePath: string) => Promise<string>;
  /** Read a binary file from agent or workspace storage as raw transferable bytes. */
  readonly readBinaryFileBytesFromDisk: (filePath: string) => Promise<ArrayBuffer>;
  /** Write content to a file on disk. Creates parent directories as needed. */
  readonly writeFileToDisk: (filePath: string, content: string) => Promise<WriteFileResult>;
  /** Run a SELECT query. Returns an array of row objects. */
  readonly sqlQuery: (query: string) => Promise<ReadonlyArray<Record<string, unknown>>>;
  /** Run a write query (INSERT, UPDATE, DELETE, CREATE TABLE). */
  readonly sqlExec: (query: string) => Promise<SqlExecResult>;
  /** Run a shell command in the sandbox. */
  readonly runCommand: (command: string, timeout?: number) => Promise<RunCommandResult>;
}

interface Window {
  readonly tasklet: TaskletApi;
}
