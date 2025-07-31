import { setImmediate as defer } from "timers";
import pino, { Logger } from "pino";

const log: Logger = pino({ name: "queue" });

type Job = () => Promise<void>;

interface WorkQueueOptions {
  concurrency?: number;
}

export class WorkQueue {
  private queue: Job[] = [];
  private active: number = 0;
  private concurrency: number;

  constructor({ concurrency = 4 }: WorkQueueOptions = {}) {
    this.concurrency = concurrency;
  }

  push(job: Job): void {
    this.queue.push(job);
    this._drain();
  }

  private _drain(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active++;
      defer(async () => {
        try {
          await job();
        } catch (e) {
          log.error({ err: e }, "job failed");
        } finally {
          this.active--;
          this._drain();
        }
      });
    }
  }
} 