import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TenantThrottlerGuard } from '../../common/tenant-throttler.guard';
import { TenantApiKeyGuard } from '../guards/tenant-api-key.guard';
import { MetricsQueryDto } from './metrics-query.dto';
import { MetricsResult, MetricsService } from './metrics.service';

@Controller('admin/tenants/:tenantId/metrics')
@UseGuards(TenantThrottlerGuard, TenantApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminMetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  get(
    @Param('tenantId') tenantId: string,
    @Query() query: MetricsQueryDto,
  ): Promise<MetricsResult> {
    return this.metrics.getMetrics(
      tenantId,
      new Date(query.from),
      new Date(query.to),
    );
  }
}
