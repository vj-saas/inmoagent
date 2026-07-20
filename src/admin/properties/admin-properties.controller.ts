import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Property } from '@prisma/client';
import { TenantThrottlerGuard } from '../../common/tenant-throttler.guard';
import { TenantApiKeyGuard } from '../guards/tenant-api-key.guard';
import { CreatePropertyDto } from './create-property.dto';
import { CsvImportResult, CsvImportService } from './csv-import.service';
import { ListPropertiesQueryDto } from './list-properties-query.dto';
import { PropertiesAdminService } from './properties-admin.service';
import { UpdatePropertyStatusDto } from './update-property-status.dto';
import { UpdatePropertyDto } from './update-property.dto';

const MAX_CSV_BYTES = 5 * 1024 * 1024;

@Controller('admin/tenants/:tenantId/properties')
@UseGuards(TenantThrottlerGuard, TenantApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminPropertiesController {
  constructor(
    private readonly properties: PropertiesAdminService,
    private readonly csvImport: CsvImportService,
  ) {}

  @Get()
  list(
    @Param('tenantId') tenantId: string,
    @Query() query: ListPropertiesQueryDto,
  ) {
    return this.properties.list(tenantId, query);
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES } }),
  )
  async import(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<CsvImportResult> {
    if (!file) {
      throw new BadRequestException('Falta el archivo CSV (campo "file")');
    }
    return this.csvImport.import(tenantId, file.buffer.toString('utf-8'));
  }

  @Get(':propertyId')
  getOne(
    @Param('tenantId') tenantId: string,
    @Param('propertyId') propertyId: string,
  ): Promise<Property> {
    return this.properties.getOne(tenantId, propertyId);
  }

  @Post()
  create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePropertyDto,
  ): Promise<Property> {
    return this.properties.create(tenantId, dto);
  }

  @Patch(':propertyId')
  update(
    @Param('tenantId') tenantId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDto,
  ): Promise<Property> {
    return this.properties.update(tenantId, propertyId, dto);
  }

  /** Endpoint crítico: pausar o marcar vendida/alquilada una propiedad. */
  @Patch(':propertyId/status')
  updateStatus(
    @Param('tenantId') tenantId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyStatusDto,
  ): Promise<Property> {
    return this.properties.updateStatus(tenantId, propertyId, dto.status);
  }

  @Delete(':propertyId')
  @HttpCode(200)
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('propertyId') propertyId: string,
  ): Promise<{ deleted: true }> {
    await this.properties.remove(tenantId, propertyId);
    return { deleted: true };
  }
}
