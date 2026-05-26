import type { Migration } from "./types";
import { migration001Initial } from "./001-initial";
import { migration002RereadColumns } from "./002-reread-columns";
import { migration003Indexes } from "./003-indexes";
import { migration004MetadataColumns } from "./004-metadata-columns";
import { migration005SourceIndexes } from "./005-source-indexes";
import { migration006PreferredSource } from "./006-preferred-source";
import { migration007EnrichmentJobs } from "./007-enrichment-jobs";
import { migration008MetadataSourceSplit } from "./008-metadata-source-split";
import { migration009OperationHistory } from "./009-operation-history";
import { migration010SavedViews } from "./010-saved-views";
import { migration011UserGoals } from "./011-user-goals";
import { migration012SeriesContentType } from "./012-series-content-type";

export const migrations: Migration[] = [
  migration001Initial,
  migration002RereadColumns,
  migration003Indexes,
  migration004MetadataColumns,
  migration005SourceIndexes,
  migration006PreferredSource,
  migration007EnrichmentJobs,
  migration008MetadataSourceSplit,
  migration009OperationHistory,
  migration010SavedViews,
  migration011UserGoals,
  migration012SeriesContentType,
];
