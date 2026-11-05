import { api, cleanQuery } from '@/lib/api';
import type { ApiMeta, ApiSuccess } from '@/types/api';
import type {
  Asset,
  AssetAssignment,
  AssetListQuery,
  AssetPayload,
  AssetStats,
  AssignAssetPayload,
  ReturnAssetPayload,
} from '@/types/asset';

const ASSETS_PATH = '/assets';

export interface AssetPage<T> {
  items: T[];
  meta: ApiMeta;
}

export async function listAssets(query: AssetListQuery = {}): Promise<AssetPage<Asset>> {
  const response = await api.get<ApiSuccess<Asset[]>>(ASSETS_PATH, { params: cleanQuery(query) });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function getAssetStats(): Promise<AssetStats> {
  const response = await api.get<ApiSuccess<AssetStats>>(`${ASSETS_PATH}/stats`);
  return response.data.data;
}

export async function getAsset(id: string): Promise<Asset> {
  const response = await api.get<ApiSuccess<Asset>>(`${ASSETS_PATH}/${id}`);
  return response.data.data;
}

export async function getAssetHistory(id: string): Promise<AssetAssignment[]> {
  const response = await api.get<ApiSuccess<AssetAssignment[]>>(`${ASSETS_PATH}/${id}/history`);
  return response.data.data;
}

export async function listMyAssetHistory(
  query: { page?: number; limit?: number } = {},
): Promise<AssetPage<AssetAssignment>> {
  const response = await api.get<ApiSuccess<AssetAssignment[]>>(`${ASSETS_PATH}/my-history`, {
    params: cleanQuery(query),
  });
  return { items: response.data.data, meta: response.data.meta as ApiMeta };
}

export async function createAsset(payload: AssetPayload): Promise<Asset> {
  const response = await api.post<ApiSuccess<Asset>>(ASSETS_PATH, payload);
  return response.data.data;
}

export async function updateAsset(id: string, payload: Partial<AssetPayload>): Promise<Asset> {
  const response = await api.patch<ApiSuccess<Asset>>(`${ASSETS_PATH}/${id}`, payload);
  return response.data.data;
}

export async function deleteAsset(id: string): Promise<{ id: string }> {
  const response = await api.delete<ApiSuccess<{ id: string }>>(`${ASSETS_PATH}/${id}`);
  return response.data.data;
}

export async function assignAsset(id: string, payload: AssignAssetPayload): Promise<Asset> {
  const response = await api.post<ApiSuccess<Asset>>(`${ASSETS_PATH}/${id}/assign`, payload);
  return response.data.data;
}

export async function returnAsset(id: string, payload: ReturnAssetPayload): Promise<Asset> {
  const response = await api.post<ApiSuccess<Asset>>(`${ASSETS_PATH}/${id}/return`, payload);
  return response.data.data;
}
