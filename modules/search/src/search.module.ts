import { DB } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { SEARCH_SERVICE, SearchController } from './search.controller';
import { SearchService, type CacheClient } from './search.service';

export interface SearchModuleOptions {
  /** Optional Redis cache client. Pass null to disable caching. */
  cache?: CacheClient | null;
}

@Module({})
export class SearchModule {
  static register(options: SearchModuleOptions = {}): DynamicModule {
    return {
      module: SearchModule,
      controllers: [SearchController],
      providers: [
        {
          provide: SEARCH_SERVICE,
          useFactory: (db: any) => new SearchService(db, options.cache ?? null),
          inject: [DB],
        },
      ],
      exports: [SEARCH_SERVICE],
    };
  }
}
