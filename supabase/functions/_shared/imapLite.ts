// Minimal IMAP-over-TLS client for reply/bounce detection. Replaces
// jsr:@bobbyg603/deno-imap, which fails Dovecot's handshake (its tagged reply
// "OK Pre-login capabilities listed, post-login capabilities have more." is
// treated as a connect error), so no client mailbox was ever actually polled.
//
// Deliberately tiny and READ-ONLY: it only ever issues EXAMINE, UID SEARCH and
// UID FETCH BODY.PEEK -- it never sets flags, so a client's inbox is never
// altered by polling.

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Untagged {
  /** Response line with every literal replaced by a placeholder. */
  line: string;
  literals: Uint8Array[];
}

export interface ImapLiteOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class ImapLite {
  private conn: Deno.TlsConn | null = null;
  private buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private tagN = 0;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ImapLiteOptions) {
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`IMAP ${what} timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  private async fill(): Promise<void> {
    const chunk = new Uint8Array(32 * 1024);
    const n = await this.withTimeout(this.conn!.read(chunk), "read");
    if (n === null) throw new Error("IMAP connection closed by server");
    this.buf = concat(this.buf, chunk.subarray(0, n));
  }

  private async readLine(): Promise<string> {
    for (;;) {
      for (let i = 0; i < this.buf.length - 1; i++) {
        if (this.buf[i] === 13 && this.buf[i + 1] === 10) {
          const line = dec.decode(this.buf.subarray(0, i));
          this.buf = this.buf.subarray(i + 2);
          return line;
        }
      }
      await this.fill();
    }
  }

  private async readBytes(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) await this.fill();
    const out = this.buf.slice(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  async connect(): Promise<void> {
    this.conn = await this.withTimeout(
      Deno.connectTls({ hostname: this.opts.host, port: this.opts.port ?? 993 }),
      "connect",
    );
    const greeting = await this.readLine();
    if (!/^\* (OK|PREAUTH)/i.test(greeting)) throw new Error(`Unexpected IMAP greeting: ${greeting.slice(0, 80)}`);
  }

  /** Sends one command and collects untagged responses until the tagged reply. */
  private async command(cmd: string): Promise<Untagged[]> {
    const tag = `t${++this.tagN}`;
    await this.conn!.write(enc.encode(`${tag} ${cmd}\r\n`));
    const untagged: Untagged[] = [];
    for (;;) {
      let line = await this.readLine();
      if (line.startsWith(`${tag} `)) {
        const status = line.slice(tag.length + 1);
        if (!/^OK/i.test(status)) {
          // Never echo the command (LOGIN carries the password).
          throw new Error(`IMAP command failed: ${status.slice(0, 120)}`);
        }
        return untagged;
      }
      const literals: Uint8Array[] = [];
      let m: RegExpMatchArray | null;
      while ((m = line.match(/\{(\d+)\}$/))) {
        literals.push(await this.readBytes(Number(m[1])));
        line = line.slice(0, m.index) + "<literal>" + (await this.readLine());
      }
      untagged.push({ line, literals });
    }
  }

  async login(username: string, password: string): Promise<void> {
    if (/[\r\n\0]/.test(username + password)) throw new Error("Credentials contain unsupported characters");
    const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    await this.command(`LOGIN ${q(username)} ${q(password)}`);
  }

  /** Read-only mailbox open (EXAMINE) -- nothing we do can change flags. */
  async examine(mailbox = "INBOX"): Promise<void> {
    await this.command(`EXAMINE "${mailbox}"`);
  }

  /** UIDs of messages received since `since` (IMAP date granularity: whole days). */
  async searchSince(since: Date): Promise<number[]> {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = `${since.getUTCDate()}-${months[since.getUTCMonth()]}-${since.getUTCFullYear()}`;
    const res = await this.command(`UID SEARCH SINCE ${d}`);
    const line = res.find((r) => /^\* SEARCH/i.test(r.line));
    if (!line) return [];
    return line.line.replace(/^\* SEARCH\s*/i, "").split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite);
  }

  /** Selected headers for many UIDs in one round trip. Keys are lowercase. */
  async fetchHeaders(uids: number[], fields: string[]): Promise<Map<number, Record<string, string>>> {
    const out = new Map<number, Record<string, string>>();
    if (uids.length === 0) return out;
    const res = await this.command(
      `UID FETCH ${uids.join(",")} (UID BODY.PEEK[HEADER.FIELDS (${fields.join(" ")})])`,
    );
    for (const r of res) {
      const uidM = r.line.match(/UID (\d+)/i);
      const lit = r.literals[0];
      if (!uidM || !lit) continue;
      const unfolded = dec.decode(lit).replace(/\r?\n[ \t]+/g, " ");
      const headers: Record<string, string> = {};
      for (const l of unfolded.split(/\r?\n/)) {
        const h = l.match(/^([^:\s]+):\s*(.*)$/);
        if (h) headers[h[1].toLowerCase()] = h[2];
      }
      out.set(Number(uidM[1]), headers);
    }
    return out;
  }

  /** Raw message (first `maxBytes`), fetched with PEEK so \Seen is untouched. */
  async fetchRaw(uid: number, maxBytes = 200_000): Promise<Uint8Array | null> {
    const res = await this.command(`UID FETCH ${uid} (UID BODY.PEEK[]<0.${maxBytes}>)`);
    return res.find((r) => r.literals[0])?.literals[0] ?? null;
  }

  async close(): Promise<void> {
    try {
      if (this.conn) {
        await this.conn.write(enc.encode(`t${++this.tagN} LOGOUT\r\n`)).catch(() => {});
        this.conn.close();
      }
    } catch { /* already closed */ }
    this.conn = null;
  }
}
