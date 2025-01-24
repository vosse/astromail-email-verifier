import { Logger } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

interface SmtpResponse {
  code: number;
  message: string;
}

export class SmtpCheckService {
  private readonly timeout: number;
  private readonly sender: string;
  private readonly dummyUser: string;
  private readonly heloHost: string;
  private readonly logger = new Logger(SmtpCheckService.name);
  private responseCache: Map<string, { response: string; timestamp: number }>;
  private readonly cacheTTL = 3600000; // 1 hour in milliseconds

  constructor(options?: {
    timeout?: number;
    sender?: string;
    dummyUser?: string;
    heloHost?: string;
  }) {
    this.timeout = options?.timeout || 10000;
    this.sender = options?.sender || 'relja@getastromail.com';
    this.dummyUser = options?.dummyUser || 'gibberishasdfasdf';
    this.heloHost = options?.heloHost || 'getastromail.com';
    this.responseCache = new Map();
  }

  private readonly SMTP_PORTS = [25, 587, 465];

  private async createConnection(host: string): Promise<net.Socket> {
    let lastError: Error | null = null;

    // Try each port in sequence
    for (const port of this.SMTP_PORTS) {
      try {
        this.logger.debug(`Attempting connection to ${host}:${port}`);
        const socket = await this.tryConnect(host, port);
        this.logger.debug(`Successfully connected to ${host}:${port}`);
        return socket;
      } catch (error) {
        lastError = error;
        this.logger.debug(
          `Failed to connect to ${host}:${port}: ${error.message}`,
        );
      }
    }

    throw lastError || new Error(`Failed to connect to ${host} on any port`);
  }

  private async tryConnect(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      const timeoutId = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, this.timeout);

      socket.connect(port, host, () => {
        clearTimeout(timeoutId);
        resolve(socket);
      });

      socket.on('error', (err) => {
        clearTimeout(timeoutId);
        socket.destroy();
        reject(err);
      });
    });
  }

  private async readResponse(socket: net.Socket): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timeoutId = setTimeout(() => {
        socket.removeAllListeners('data');
        reject(new Error('Response timeout'));
      }, this.timeout);

      socket.on('data', (data) => {
        buffer += data.toString();
        if (buffer.includes('\r\n')) {
          const lines = buffer.split('\r\n');
          const lastLine = lines[lines.length - 2]; // Last complete line

          if (lastLine && /^\d{3}/.test(lastLine)) {
            clearTimeout(timeoutId);
            socket.removeAllListeners('data');
            const code = parseInt(lastLine.substring(0, 3), 10);
            resolve({ code, message: lastLine });
          }
        }
      });
    });
  }

  private async upgradeToTLS(
    socket: net.Socket,
    host: string,
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const tlsSocket = tls.connect({
        socket: socket,
        host: host,
        rejectUnauthorized: false, // Some SMTP servers might use self-signed certificates
      });

      const timeoutId = setTimeout(() => {
        tlsSocket.destroy();
        reject(new Error('TLS upgrade timeout'));
      }, this.timeout);

      tlsSocket.once('secureConnect', () => {
        clearTimeout(timeoutId);
        resolve(tlsSocket);
      });

      tlsSocket.once('error', (err) => {
        clearTimeout(timeoutId);
        tlsSocket.destroy();
        reject(err);
      });
    });
  }

  private async sendCommand(
    socket: net.Socket | tls.TLSSocket,
    command: string,
  ): Promise<SmtpResponse> {
    this.logger.debug(`Sending command: ${command}`);
    socket.write(command + '\r\n');
    const response = await this.readResponse(socket);
    this.logger.debug(
      `Received response: ${response.code} ${response.message}`,
    );
    return response;
  }

  public async isEmailValid(
    domain: string,
    localPart: string,
  ): Promise<{ smtp: boolean; catchall: boolean }> {
    const email = `${localPart}@${domain}`;
    if (!localPart || !domain) return { smtp: false, catchall: false };

    // Get MX records
    const mxRecords = await resolveMx(domain);
    if (!mxRecords?.length) {
      this.logger.debug(`No MX records found for ${domain}`);
      return { smtp: false, catchall: false };
    }

    const sortedMxRecords = mxRecords.sort((a, b) => a.priority - b.priority);

    for (const mx of sortedMxRecords) {
      const mxServer = mx.exchange;
      this.logger.debug(
        `Trying MX server: ${mxServer} (priority: ${mx.priority})`,
      );

      let socket: net.Socket | undefined;

      try {
        const cacheKey = `${domain}_${mxServer}`;
        const cached = this.responseCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
          if (cached.response === 'catch-all') {
            this.logger.debug(`Domain ${domain} is cached as catch-all`);
            return { smtp: true, catchall: true };
          }
        }

        socket = await this.createConnection(mxServer);

        const greeting = await this.readResponse(socket);
        if (greeting.code !== 220) {
          throw new Error(`Unexpected greeting: ${greeting.message}`);
        }

        const ehlo = await this.sendCommand(socket, `EHLO ${this.heloHost}`);
        if (ehlo.code !== 250) {
          const helo = await this.sendCommand(socket, `HELO ${this.heloHost}`);
          if (helo.code !== 250) {
            throw new Error(`HELO failed: ${helo.message}`);
          }
        }

        if (ehlo.message.includes('STARTTLS')) {
          this.logger.debug('STARTTLS supported, upgrading connection');
          const startTls = await this.sendCommand(socket, 'STARTTLS');
          if (startTls.code === 220) {
            socket = await this.upgradeToTLS(socket, mxServer);
            const secureEhlo = await this.sendCommand(
              socket,
              `EHLO ${this.heloHost}`,
            );
            if (secureEhlo.code !== 250) {
              throw new Error(
                `EHLO failed after STARTTLS: ${secureEhlo.message}`,
              );
            }
          }
        }

        const from = await this.sendCommand(
          socket,
          `MAIL FROM:<${this.sender}>`,
        );
        if (from.code !== 250) {
          throw new Error(`MAIL FROM failed: ${from.message}`);
        }

        if (!cached) {
          const dummyEmail = `${this.dummyUser}@${domain}`;
          const dummyTest = await this.sendCommand(
            socket,
            `RCPT TO:<${dummyEmail}>`,
          );

          if (dummyTest.code === 250) {
            this.logger.debug(`Domain ${domain} detected as catch-all`);
            this.responseCache.set(cacheKey, {
              response: 'catch-all',
              timestamp: Date.now(),
            });
            return { smtp: true, catchall: true };
          }

          this.responseCache.set(cacheKey, {
            response: dummyTest.message,
            timestamp: Date.now(),
          });
        }

        const rcpt = await this.sendCommand(socket, `RCPT TO:<${email}>`);

        if (cached && cached.response !== 'catch-all') {
          return {
            smtp: rcpt.message !== cached.response,
            catchall: false,
          };
        }

        return {
          smtp: rcpt.code === 250,
          catchall: false,
        };
      } catch (error) {
        this.logger.error(
          `Verification failed for ${mxServer}: ${error.message}`,
        );
        continue;
      } finally {
        if (socket && !socket.destroyed) {
          try {
            await this.sendCommand(socket, 'QUIT');
          } catch (error) {
            this.logger.error(`Error sending QUIT: ${error.message}`);
          } finally {
            socket.destroy();
          }
        }
      }
    }

    this.logger.debug('All MX servers failed');
    return { smtp: false, catchall: false };
  }
}
