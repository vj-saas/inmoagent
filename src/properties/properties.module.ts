import { Module } from '@nestjs/common';
import { PropertySearchService } from './property-search.service';

@Module({
  providers: [PropertySearchService],
  exports: [PropertySearchService],
})
export class PropertiesModule {}
