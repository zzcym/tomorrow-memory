import { db } from '../db/sqlite';

export const audit = () => db.all();

