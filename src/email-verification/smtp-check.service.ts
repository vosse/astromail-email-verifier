import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns/promises';
import * as net from 'net';
import * as tls from 'tls';

interface SmtpOptions {
  heloHost?: string;
  connectionTimeoutMs?: number;
  attemptCatchAllTest?: boolean;
  randomAddressesCount?: number;
}

interface SmtpSocket {
  socket: net.Socket | tls.TLSSocket;
  write: (data: string) => void;
  destroy: () => void;
  isSecure: boolean;
  linesQueue: string[];
}

@Injectable()
export class SmtpCheckService {
  private readonly logger = new Logger(SmtpCheckService.name);

  constructor() {}

  private createSmtpSocket(plainSocket: net.Socket): SmtpSocket {
    return {
      socket: plainSocket,
      write: (data: string) => plainSocket.write(data),
      destroy: () => {
        this.cleanup(plainSocket);
      },
      isSecure: false,
      linesQueue: [],
    };
  }

  private cleanup(socket: net.Socket | tls.TLSSocket) {
    if (socket) {
      socket.removeAllListeners();
      if (!socket.destroyed) {
        socket.end();
        socket.destroy();
      }
    }
  }

  private async verifyWithServer(
    mxHost: string,
    domain: string,
    localPart: string,
    options: SmtpOptions,
  ): Promise<boolean> {
    const { heloHost = 'getastromail', connectionTimeoutMs = 10_000 } = options;

    const port = 25;

    return new Promise<boolean>((resolve, reject) => {
      let rawData = '';
      let isUpgradedToTLS = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const plainSocket = net.createConnection(port, mxHost);
      let smtpSocket = this.createSmtpSocket(plainSocket);

      const setupTimeout = () => {
        if (timeoutHandle) {
          global.clearTimeout(timeoutHandle);
        }
        timeoutHandle = global.setTimeout(() => {
          const error = new Error('Connection timeout');
          smtpSocket.destroy();
          reject(error);
        }, connectionTimeoutMs);
      };

      const removeTimeout = () => {
        if (timeoutHandle) {
          global.clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
      };

      const handleData = (data: Buffer | string) => {
        rawData += data.toString();
        const lines = rawData.split('\r\n');
        rawData = lines.pop() || '';
        smtpSocket.linesQueue.push(...lines.filter(Boolean));
      };

      plainSocket.setEncoding('utf-8');
      setupTimeout();

      plainSocket.on('data', handleData);

      plainSocket.on('error', (err) => {
        this.logger.error(`Socket error for ${mxHost}: ${err}`);
        removeTimeout();
        smtpSocket.destroy();
        reject(err);
      });

      plainSocket.once('connect', async () => {
        this.logger.debug(`Connected to ${mxHost}`);
        try {
          let line = await waitForLine();
          if (!/^220/.test(line)) {
            throw new Error(`Unexpected greeting: ${line}`);
          }

          line = await sendCommand(`EHLO ${heloHost}`);
          if (!line.includes('250')) {
            throw new Error(`EHLO not accepted: ${line}`);
          }

          const serverSupportsStartTLS = smtpSocket.linesQueue.some((l) =>
            l.includes('STARTTLS'),
          );
          smtpSocket.linesQueue.length = 0;

          if (serverSupportsStartTLS && !isUpgradedToTLS) {
            line = await sendCommand('STARTTLS');
            if (line.startsWith('220')) {
              smtpSocket = await this.upgradeToTLS(
                smtpSocket,
                mxHost,
                connectionTimeoutMs,
              );
              isUpgradedToTLS = true;
            }
          }

          line = await sendCommand(`EHLO ${heloHost}`);
          if (!line.includes('250')) {
            throw new Error(`EHLO after STARTTLS not accepted: ${line}`);
          }

          line = await sendCommand(`MAIL FROM:<relja@${heloHost}.com>`);
          if (!line.startsWith('250')) {
            throw new Error(`MAIL FROM rejected: ${line}`);
          }

          line = await sendCommand(`RCPT TO:<${localPart}@${domain}>`);
          await sendCommand('QUIT');

          if (line.startsWith('250')) {
            resolve(true);
          } else if (line.startsWith('550')) {
            resolve(false);
          } else if (/^4\d\d/.test(line)) {
            reject(new Error(`Temporary error (4xx): ${line}`));
          } else {
            reject(new Error(`Unrecognized response: ${line}`));
          }
        } catch (err) {
          reject(err);
        } finally {
          removeTimeout();
          smtpSocket.destroy();
        }
      });

      const sendCommand = async (command: string): Promise<string> => {
        this.logger.debug(`Sending command: ${command}`);
        smtpSocket.linesQueue.length = 0;
        setupTimeout();

        return new Promise((resolveSend, rejectSend) => {
          smtpSocket.write(command + '\r\n');
          waitForLine()
            .then((line) => {
              this.logger.debug(`Received response: ${line}`);
              resolveSend(line);
            })
            .catch(rejectSend);
        });
      };

      const waitForLine = async (): Promise<string> => {
        return new Promise((resolveLine, rejectLine) => {
          const checkQueue = () => {
            if (smtpSocket.linesQueue.length > 0) {
              const line = smtpSocket.linesQueue.shift()!;
              resolveLine(line);
            } else if (
              !smtpSocket.socket.readable ||
              smtpSocket.socket.destroyed
            ) {
              rejectLine(new Error('Socket closed before receiving data.'));
            } else {
              setImmediate(checkQueue);
            }
          };
          checkQueue();
        });
      };
    });
  }

  private async upgradeToTLS(
    currentSocket: SmtpSocket,
    host: string,
    timeout: number,
  ): Promise<SmtpSocket> {
    return new Promise((resolve, reject) => {
      const tlsSocket = tls.connect(
        {
          socket: currentSocket.socket as net.Socket,
          servername: host,
        },
        () => {
          const newSmtpSocket: SmtpSocket = {
            socket: tlsSocket,
            write: (data: string) => tlsSocket.write(data),
            destroy: () => {
              this.cleanup(tlsSocket);
            },
            isSecure: true,
            linesQueue: currentSocket.linesQueue, // Preserve the existing queue
          };

          tlsSocket.setTimeout(timeout);
          tlsSocket.on('data', (data) => {
            const lines = data.toString().split('\r\n');
            newSmtpSocket.linesQueue.push(...lines.filter(Boolean));
          });

          resolve(newSmtpSocket);
        },
      );

      tlsSocket.on('error', (err) => {
        this.cleanup(tlsSocket);
        reject(err);
      });

      tlsSocket.on('timeout', () => {
        this.cleanup(tlsSocket);
        reject(new Error('TLS socket timeout'));
      });
    });
  }

  // Rest of the class implementation remains the same...
  public async performSmtpVerification(
    domain: string,
    localPart: string,
    options: SmtpOptions = {},
  ): Promise<boolean> {
    this.logger.debug(`Starting SMTP verification for ${localPart}@${domain}`);
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        this.logger.warn(`No MX records found for domain=${domain}`);
        return false;
      }

      mxRecords.sort((a, b) => a.priority - b.priority);

      for (const mx of mxRecords) {
        this.logger.debug(`Testing MX server: ${mx.exchange}`);
        try {
          const accepted = await this.verifyWithServer(
            mx.exchange,
            domain,
            localPart,
            options,
          );
          if (accepted) {
            this.logger.debug(`Email accepted by MX server: ${mx.exchange}`);
            return true;
          }
        } catch (err) {
          this.logger.error(`Error verifying with ${mx.exchange}: ${err}`);
          continue;
        }
      }

      this.logger.debug(`No MX server accepted the email address.`);
      return false;
    } catch (err) {
      this.logger.error(`Verification error: ${err}`);
      return false;
    }
  }
}
