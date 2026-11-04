import { Module } from '@nestjs/common';
import { AdminCatalogController, AdminStockController } from './admin-catalog.controller.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { BuyAgainController } from './buy-again.controller.js';
import { BulkPriceService } from './bulk-price.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogExportService } from './excel/catalog-export.service.js';
import { CatalogImportService } from './excel/catalog-import.service.js';
import { PricingService } from './pricing.service.js';
import { StockService } from './stock.service.js';

@Module({
  controllers: [CatalogController, BuyAgainController, AdminCatalogController, AdminStockController],
  providers: [
    CatalogService,
    PricingService,
    AdminCatalogService,
    StockService,
    BulkPriceService,
    CatalogImportService,
    CatalogExportService,
  ],
  exports: [PricingService, StockService, CatalogService],
})
export class CatalogModule {}
