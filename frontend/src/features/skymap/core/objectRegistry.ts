import type { SkyLayerData, SkyLayerId, SkyLayerRegistry, SkyLayerState } from "./layers";
import { getSkyObjectImportanceScore, type SkyObject, type SkyObjectId } from "./objects";

export interface SkyObjectRegistryRecord {
  object: SkyObject;
  layerId: SkyLayerId;
  layerLabel: string;
  layerVisible: boolean;
  layerSearchable: boolean;
  sourceLabel?: string;
}

export interface SkyObjectSearchResult {
  record: SkyObjectRegistryRecord;
  score: number;
  matchedField: "name" | "alias" | "keyword" | "tag" | "description" | "source" | "kind";
  matchedText: string;
}

export interface SkyObjectRegistry {
  records: SkyObjectRegistryRecord[];
  searchableRecords: SkyObjectRegistryRecord[];
  byId: Map<SkyObjectId, SkyObjectRegistryRecord>;
  search: (query: string, limit?: number) => SkyObjectSearchResult[];
}

interface SearchCandidateField {
  field: SkyObjectSearchResult["matchedField"];
  text: string;
  weight: number;
}

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const candidateFieldsForObject = (record: SkyObjectRegistryRecord): SearchCandidateField[] => {
  const { object, sourceLabel } = record;
  return [
    { field: "name", text: object.name, weight: 140 },
    ...(object.search?.aliases ?? []).map((text) => ({ field: "alias" as const, text, weight: 110 })),
    ...(object.search?.keywords ?? []).map((text) => ({ field: "keyword" as const, text, weight: 82 })),
    ...(object.search?.tags ?? []).map((text) => ({ field: "tag" as const, text, weight: 58 })),
    object.search?.description ? { field: "description" as const, text: object.search.description, weight: 34 } : null,
    sourceLabel ? { field: "source" as const, text: sourceLabel, weight: 28 } : null,
    { field: "kind", text: object.kind.replace(/-/g, " "), weight: 22 },
  ].filter((field): field is SearchCandidateField => Boolean(field?.text.trim()));
};

const scoreField = (query: string, queryTokens: string[], fieldText: string, weight: number) => {
  const normalizedField = normalizeSearchText(fieldText);
  if (!normalizedField) return 0;
  if (normalizedField === query) return weight + 120;
  if (normalizedField.startsWith(query)) return weight + 85;
  if (normalizedField.includes(query)) return weight + 48;

  const tokenHits = queryTokens.filter((token) => normalizedField.includes(token)).length;
  if (!tokenHits) return 0;
  return weight * (tokenHits / queryTokens.length) + tokenHits * 8;
};

const scoreRecord = (record: SkyObjectRegistryRecord, query: string, queryTokens: string[]) => {
  let bestResult: SkyObjectSearchResult | null = null;
  for (const field of candidateFieldsForObject(record)) {
    const baseScore = scoreField(query, queryTokens, field.text, field.weight);
    if (!baseScore) continue;
    const visualPriority = (record.object.visual?.labelPriority ?? 0) * 0.08;
    const importanceBoost = getSkyObjectImportanceScore(record.object) * 0.18;
    const visibleLayerBoost = record.layerVisible ? 6 : 0;
    const score = baseScore + visualPriority + importanceBoost + visibleLayerBoost;
    if (!bestResult || score > bestResult.score) {
      bestResult = {
        record,
        score,
        matchedField: field.field,
        matchedText: field.text,
      };
    }
  }
  return bestResult;
};

export const createSkyObjectRegistry = (
  layerRegistry: SkyLayerRegistry,
  layerData: SkyLayerData[],
  layerStates: Record<SkyLayerId, SkyLayerState>,
): SkyObjectRegistry => {
  const records = layerData.flatMap((data) => {
    const definition = layerRegistry.getDefinition(data.layerId);
    const layerState = layerStates[data.layerId];
    if (!definition || data.status !== "ready") {
      return [];
    }
    return data.objects.map((object): SkyObjectRegistryRecord => {
      const source = object.provenance.at(0);
      return {
        object,
        layerId: data.layerId,
        layerLabel: definition.label,
        layerVisible: Boolean(layerState?.visible),
        layerSearchable: Boolean(definition.capabilities.searchable),
        sourceLabel: source?.catalog ?? source?.source ?? source?.sourceId,
      };
    });
  });

  const searchableRecords = records.filter((record) => record.layerSearchable);
  const byId = new Map(records.map((record) => [record.object.id, record]));

  return {
    records,
    searchableRecords,
    byId,
    search: (query, limit = 8) => {
      const normalizedQuery = normalizeSearchText(query);
      if (!normalizedQuery) return [];
      const queryTokens = normalizedQuery.split(" ").filter(Boolean);
      return searchableRecords
        .map((record) => scoreRecord(record, normalizedQuery, queryTokens))
        .filter((result): result is SkyObjectSearchResult => Boolean(result))
        .sort((a, b) => b.score - a.score || a.record.object.name.localeCompare(b.record.object.name))
        .slice(0, limit);
    },
  };
};
