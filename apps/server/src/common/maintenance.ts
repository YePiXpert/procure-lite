import { EventEmitter } from 'node:events';
export const restoreEvents = new EventEmitter();
import { ServiceUnavailableException } from '@nestjs/common';
/** Single-process admission gate shared by HTTP writes and background jobs. */
export const maintenance = {
  locked: false,
  active: 0,
  epoch: 0,
  enter() {
    if (this.locked) throw new ServiceUnavailableException('备份或恢复维护中，请稍后重试');
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  },
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.locked) throw new ServiceUnavailableException('维护任务进行中');
    this.locked = true;
    try {
      const until = Date.now() + 190_000;
      while (this.active) {
        if (Date.now() > until)
          throw new ServiceUnavailableException('仍有处理中任务，维护未开始，请稍后重试');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return await fn();
    } finally {
      this.locked = false;
    }
  },
};
