// utils/optionTokenPicker.ts
import dayjs from 'dayjs';
import { ScripRecord } from '../services/scripMasterService';

export interface TokenMap {
  ce: Record<number /*strike*/, string /*token*/>;
  pe: Record<number, string>;
}

export function buildTokenMap(
  masters: ScripRecord[],
  expiryISO: string,
  strikes: number[]
): TokenMap {
  const map: TokenMap = { ce: {}, pe: {} };

  // Angel’s symbol looks like  NIFTY24MAY24500CE
  const expiryTag = dayjs(expiryISO).format('DDMMMYY').toUpperCase(); // 22MAY25 → 22MAY25

  masters.forEach((rec) => {
    if (rec.exch_seg !== 'NFO' || rec.instrumenttype !== 'OPTIDX') return;
    if (rec.name !== 'NIFTY') return;                      // BANKNIFTY? change this
    if (!rec.symbol.startsWith('NIFTY' + expiryTag)) return;

    const [, strikeStr, optType] =
      rec.symbol.match(/^NIFTY[0-9]{2}[A-Z]{3}[0-9]{2}(\d+)(CE|PE)$/) || [];
    if (!strikeStr) return;

    const strike = Number(strikeStr);
    if (!strikes.includes(strike)) return;

    if (optType === 'CE') map.ce[strike] = rec.token;
    else map.pe[strike] = rec.token;
  });

  return map;
}