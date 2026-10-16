import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { SEARCH_SERVICE, SearchController } from './search.controller';
import { SearchService, type CacheClient } from './search.service';

export const SEARCH_DB = 'SEARCH_DB';

export interface SearchModuleOptions {
  db: Db;
  /** Optional Redis cache client. Pass null to disable caching. */
  cache?: CacheClient | null;
}

@Module({})
export class SearchModule {
  static register(options: SearchModuleOptions): DynamicModule {
    return {
      module: SearchModule,
      controllers: [SearchController],
      providers: [
        { provide: SEARCH_DB, useValue: options.db },
        {
          provide: SEARCH_SERVICE,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          useFactory: (db: any) => new SearchService(db, options.cache ?? null),
          inject: [SEARCH_DB],
        },
      ],
      exports: [SEARCH_SERVICE],
    };
  }
}

export const searchMigrationsDir = new URL('../migrations', import.meta.url).pathname;
