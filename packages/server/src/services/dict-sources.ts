/**
 * 离线词典数据源：stardict.db（340 万词条）、examples.db（15 万例句）、ec-cedict.json（中英）
 * 全部只读访问，文件不存在时优雅降级为 null。
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { ExamplePair, Zh2EnEntry } from '@tm/shared';
import { parseTranslation } from '@tm/shared';
import type { AppConfig } from '../config.js';

export interface DictSources {
  /** stardict.db 查询（精确/近似匹配英译中） */
  lookupStardict(word: string): StardictRow | null;
  /** stardict.db 反向搜索（中译英） */
  queryStardictZh2En(word: string): Zh2EnEntry[];
  /** examples.db FTS 查询例句 */
  queryExamples(word: string): ExamplePair[];
  /** ec-cedict.json 精确查询 */
  queryEcDict(word: string): Zh2EnEntry[] | null;
  close(): void;
}

/** stardict 表行（只取用到的列） */
export interface StardictRow {
  word: string;
  sw: string | null;
  phonetic: string | null;
  definition: string | null;
  translation: string | null;
  collins: number | null;
  oxford: number | null;
  tag: string | null;
  bnc: number | null;
  frq: number | null;
  exchange: string | null;
  detail: string | null;
  audio: string | null;
}

export function createDictSources(config: AppConfig): DictSources {
  let dictDb: Database.Database | null = null;
  if (fs.existsSync(config.dictDbPath)) {
    try {
      dictDb = new Database(config.dictDbPath, { readonly: true });
    } catch (err) {
      console.error('[DICT] 打开 stardict.db 失败:', err);
    }
  }

  let examplesDb: Database.Database | null = null;
  if (fs.existsSync(config.examplesDbPath)) {
    try {
      examplesDb = new Database(config.examplesDbPath, { readonly: true });
    } catch (err) {
      console.error('[DICT] 打开 examples.db 失败:', err);
    }
  }

  let ecDict: Record<string, Zh2EnEntry[]> | null = null;
  if (fs.existsSync(config.ecDictPath)) {
    try {
      ecDict = JSON.parse(fs.readFileSync(config.ecDictPath, 'utf-8')) as Record<string, Zh2EnEntry[]>;
    } catch {
      ecDict = null;
    }
  }

  return {
    lookupStardict(word: string): StardictRow | null {
      if (!dictDb) return null;
      try {
        let row = dictDb.prepare('SELECT * FROM stardict WHERE word = ?').get(word) as StardictRow | undefined;
        if (!row) {
          row = dictDb.prepare('SELECT * FROM stardict WHERE word = ?').get(word.toLowerCase()) as
            | StardictRow
            | undefined;
        }
        if (!row) {
          row = dictDb.prepare('SELECT * FROM stardict WHERE sw = ?').get(word.toLowerCase()) as
            | StardictRow
            | undefined;
        }
        return row ?? null;
      } catch {
        return null;
      }
    },

    queryStardictZh2En(word: string): Zh2EnEntry[] {
      if (!dictDb) return [];
      try {
        const clean = word.replace(/[^\w一-鿿㐀-䶿豈-﫿]/g, '').trim();
        if (!clean) return [];
        const rows = dictDb
          .prepare(
            `SELECT word, phonetic, translation, collins, bnc, frq, tag, exchange
             FROM stardict
             WHERE rowid IN (SELECT rowid FROM stardict_fts WHERE stardict_fts MATCH ?)
             ORDER BY collins DESC, bnc DESC
             LIMIT 20`,
          )
          .all(clean) as Array<{
          word: string;
          phonetic: string | null;
          translation: string | null;
        }>;
        return rows.map((row) => {
          const groups = parseTranslation(row.translation);
          return {
            word: row.word,
            pos: groups.length > 0 ? groups[0]!.pos : '',
            definition: word,
            examples: [],
            synonyms: [],
            phonetic: row.phonetic || '',
          };
        });
      } catch {
        return [];
      }
    },

    queryExamples(word: string): ExamplePair[] {
      if (!examplesDb) return [];
      try {
        const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (!clean || clean.length < 2) return [];
        const rows = examplesDb
          .prepare(
            `SELECT DISTINCT p.en, p.zh FROM pairs_fts f
             JOIN pairs p ON p.id = f.rowid
             WHERE pairs_fts MATCH ?
             LIMIT 8`,
          )
          .all(`"${clean}"`) as Array<{ en: string; zh: string }>;
        return rows;
      } catch {
        return [];
      }
    },

    queryEcDict(word: string): Zh2EnEntry[] | null {
      if (!ecDict || !ecDict[word]) return null;
      return ecDict[word]!.map((entry) => ({
        word: entry.word,
        pos: entry.pos || '',
        definition: word,
        examples: entry.examples || [],
        synonyms: entry.synonyms || [],
        phonetic: entry.phonetic || '',
      }));
    },

    close(): void {
      if (dictDb) dictDb.close();
      if (examplesDb) examplesDb.close();
    },
  };
}
