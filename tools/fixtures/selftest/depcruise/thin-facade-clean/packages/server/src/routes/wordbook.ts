import type { AppDB } from '../db/types';

declare const db: AppDB;
export const list = () => db.all();

