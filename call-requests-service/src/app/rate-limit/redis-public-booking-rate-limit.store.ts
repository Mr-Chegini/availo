import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import type {
  ConsumeRateLimitInput,
  PublicBookingRateLimitStore,
} from './rate-limit-store';

const INCREMENT_WITH_TTL_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class RedisPublicBookingRateLimitStore
  implements PublicBookingRateLimitStore, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisPublicBookingRateLimitStore.name);
  private client?: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  async consume(input: ConsumeRateLimitInput): Promise<number> {
    const client = await this.getClient();
    const response = await client.eval(INCREMENT_WITH_TTL_SCRIPT, {
      keys: [input.key],
      arguments: [input.windowMs.toString()],
    });

    if (typeof response !== 'number') {
      throw new Error('Redis rate-limit script did not return a number');
    }

    return response;
  }

  async onApplicationShutdown(): Promise<void> {
    const client = this.client;
    this.client = undefined;

    if (client?.isOpen) {
      await client.quit();
    }
  }

  private async getClient(): Promise<RedisClientType> {
    if (this.client?.isOpen) {
      return this.client;
    }

    const client = createClient({
      url: this.configService.getOrThrow<string>('REDIS_URL'),
    });

    client.on('error', (error) => {
      this.logger.error('Redis rate-limit client error', error);
    });

    await client.connect();
    this.client = client as RedisClientType;
    return this.client;
  }
}
