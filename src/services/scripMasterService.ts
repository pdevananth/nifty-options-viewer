// services/scripMasterService.ts
import axios from 'axios';
import NodeCache from 'node-cache';
import logger from '../utils/logger';

const cache = new NodeCache({ stdTTL: 24 * 60 * 60 });      // 24-hour cache
const URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

export interface ScripRecord {
  token: string;
  symbol: string;
  name: string;
  expiry: string;          // yyyy-mm-dd or empty for indices
  strike: string;          // "24500.000000"
  exch_seg: 'NFO' | 'NSE';
  instrumenttype: 'OPTIDX' | 'OPTSTK' | 'FUTIDX' | string;
}

export async function getScripMaster(): Promise<ScripRecord[]> {
  const cached = cache.get<ScripRecord[]>('scripMaster');
  if (cached) return cached;

  logger.info('Downloading OpenAPI ScripMaster…');
  const { data } = await axios.get<ScripRecord[]>(URL, { timeout: 20000 });
  cache.set('scripMaster', data);
  logger.info(`ScripMaster loaded (${data.length.toLocaleString()} rows)`);
  return data;
}